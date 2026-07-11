import { Hono } from 'hono';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { users, exercises, disciplines, fights, partners, rankPromotions, routines, sessions, weightLogs } from '../db/schema';
import { verifyGoogleIdToken } from '../lib/googleAuth';
import { signJwt, verifyJwt } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { isCompedEmail } from '../lib/entitlements';
import { authMiddleware } from '../middleware/auth';
import type { User } from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    AUTH_RATE_LIMITER?: RateLimit;
  };
  Variables: {
    userId: string;
  };
};

const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

// Per-IP brute-force guard for the endpoints that accept credentials or mint
// accounts. Uses the Workers Rate Limiting binding when configured; absent
// (local dev, vitest) it allows everything. Returns a 429 response to send,
// or null to proceed.
async function rateLimited(
  c: { env: Env['Bindings']; req: { header: (name: string) => string | undefined }; json: (obj: unknown, status: 429) => Response },
  route: string,
): Promise<Response | null> {
  const limiter = c.env.AUTH_RATE_LIMITER;
  if (!limiter) return null;
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success } = await limiter.limit({ key: `${route}:${ip}` });
  if (success) return null;
  return c.json({ error: 'Too many attempts — try again in a minute' }, 429);
}

function toUserShape(dbUser: {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  passwordHash?: string | null;
}): User {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? null,
    avatarUrl: dbUser.avatarUrl ?? null,
    isGuest: dbUser.isGuest,
    isComped: isCompedEmail(dbUser.email),
    hasPassword: !!dbUser.passwordHash,
  };
}

// Basic RFC-5322-ish email shape check — good enough to reject obvious garbage;
// the real validation is that the account exists / password matches.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Db = ReturnType<typeof createDb>;

// Resolve a guest-migration request to a verified guest user id. The caller
// must present the guest session's own JWT — possession of the token is the
// proof; a bare user id is never trusted. Returns null when no token was
// sent; throws GuestTokenError when a token was sent but fails verification
// (expired/tampered) so routes reject loudly instead of silently dropping the
// user's guest history.
class GuestTokenError extends Error {}

async function resolveGuestId(guestToken: unknown, jwtSecret: string): Promise<string | null> {
  if (guestToken == null) return null;
  if (typeof guestToken !== 'string' || !guestToken) throw new GuestTokenError();
  try {
    const payload = await verifyJwt(guestToken, jwtSecret);
    return payload.sub;
  } catch {
    throw new GuestTokenError();
  }
}

// Reassign a guest account's data to a real (Google or credential) user, then
// delete the guest row. Mirrors the merge used by the Google flow so every
// sign-in method migrates guest data identically.
async function migrateGuestData(db: Db, guestUserId: string, realUserId: string): Promise<void> {
  const guestUser = await db.query.users.findFirst({
    where: eq(users.id, guestUserId),
  });

  if (!guestUser?.isGuest || guestUser.id === realUserId) return;

  await db.update(exercises).set({ userId: realUserId }).where(eq(exercises.userId, guestUser.id));
  await db.update(disciplines).set({ userId: realUserId }).where(eq(disciplines.userId, guestUser.id));
  await db.update(partners).set({ userId: realUserId }).where(eq(partners.userId, guestUser.id));
  await db.update(fights).set({ userId: realUserId }).where(eq(fights.userId, guestUser.id));
  await db.update(rankPromotions).set({ userId: realUserId }).where(eq(rankPromotions.userId, guestUser.id));
  await db.update(weightLogs).set({ userId: realUserId }).where(eq(weightLogs.userId, guestUser.id));
  await db.update(routines).set({ userId: realUserId }).where(eq(routines.userId, guestUser.id));
  await db.update(sessions).set({ userId: realUserId }).where(eq(sessions.userId, guestUser.id));
  // session_entries and strength_sets cascade through sessions/routines — no direct user_id
  await db.delete(users).where(eq(users.id, guestUser.id));
}

const authRoutes = new Hono<Env>();

// ── Guest sign-in ──────────────────────────────────────────────────────────
authRoutes.post('/guest', async (c) => {
  const limited = await rateLimited(c, 'guest');
  if (limited) return limited;

  let body: { deviceId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.deviceId || typeof body.deviceId !== 'string' || body.deviceId.length < 8) {
    return c.json({ error: 'deviceId is required' }, 400);
  }

  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    // Upsert: find existing guest user by deviceId or create a new one
    const [dbUser] = await db
      .insert(users)
      .values({
        deviceId: body.deviceId,
        isGuest: true,
        email: null,
        name: null,
        avatarUrl: null,
      })
      .onConflictDoUpdate({
        target: users.deviceId,
        set: { isGuest: true }, // no-op update so RETURNING works
      })
      .returning();

    const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

    return c.json({ sessionToken, user: toUserShape(dbUser) });
  } catch (e) {
    console.error('[auth/guest]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// ── Google sign-in (with optional guest migration) ─────────────────────────
authRoutes.post('/google', async (c) => {
  let body: { idToken?: string; guestToken?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.idToken) {
    return c.json({ error: 'idToken is required' }, 400);
  }

  let guestId: string | null;
  try {
    guestId = await resolveGuestId(body.guestToken, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'Invalid guest token' }, 401);
  }

  let googlePayload: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    googlePayload = await verifyGoogleIdToken(body.idToken, c.env.GOOGLE_CLIENT_ID);
  } catch (e) {
    console.error('[auth/google] token verification failed', e);
    return c.json({ error: 'Invalid Google ID token' }, 401);
  }

  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    // Upsert the real Google user
    const [dbUser] = await db
      .insert(users)
      .values({
        googleSub: googlePayload.sub,
        isGuest: false,
        email: googlePayload.email,
        name: googlePayload.name || null,
        avatarUrl: googlePayload.picture || null,
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: {
          isGuest: false,
          email: googlePayload.email,
          name: googlePayload.name || null,
          avatarUrl: googlePayload.picture || null,
        },
      })
      .returning();

    // Migrate guest data if a verified guest token was provided
    if (guestId) {
      await migrateGuestData(db, guestId, dbUser.id);
    }

    const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

    return c.json({ sessionToken, user: toUserShape(dbUser) });
  } catch (e) {
    console.error('[auth/google]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// ── Register (email/password, with optional guest migration) ────────────────
authRoutes.post('/register', async (c) => {
  const limited = await rateLimited(c, 'register');
  if (limited) return limited;

  let body: { email?: string; password?: string; name?: string | null; guestToken?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;

  if (!EMAIL_RE.test(email)) {
    return c.json({ error: 'Enter a valid email address' }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  // Verify before creating the account so a bad token can't leave a fresh
  // account with the guest data stranded behind it.
  let guestId: string | null;
  try {
    guestId = await resolveGuestId(body.guestToken, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'Invalid guest token' }, 401);
  }

  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    // Reject if this email already belongs to a Google account — those accounts
    // have no password, so steer the user to Google rather than minting a
    // second, conflicting identity for the same address.
    const googleAccount = await db.query.users.findFirst({
      where: and(eq(sql`lower(${users.email})`, email), eq(users.isGuest, false), isNotNull(users.googleSub)),
    });
    if (googleAccount) {
      return c.json({ error: 'This email is linked to Google sign-in — use Continue with Google' }, 409);
    }

    // Reject duplicate credential accounts (the partial unique index also
    // guards this at the DB level; this gives a friendly message first).
    const existingCredential = await db.query.users.findFirst({
      where: and(eq(sql`lower(${users.email})`, email), isNotNull(users.passwordHash)),
    });
    if (existingCredential) {
      return c.json({ error: 'An account with this email already exists' }, 409);
    }

    const passwordHash = await hashPassword(password);

    let dbUser;
    try {
      [dbUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          isGuest: false,
          name,
          avatarUrl: null,
        })
        .returning();
    } catch (e) {
      // Unique-index race: another registration won between our check and insert.
      console.error('[auth/register] insert failed', e);
      return c.json({ error: 'An account with this email already exists' }, 409);
    }

    if (guestId) {
      await migrateGuestData(db, guestId, dbUser.id);
    }

    const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

    return c.json({ sessionToken, user: toUserShape(dbUser) });
  } catch (e) {
    console.error('[auth/register]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// ── Login (email/password, with optional guest migration) ───────────────────
authRoutes.post('/login', async (c) => {
  const limited = await rateLimited(c, 'login');
  if (limited) return limited;

  let body: { email?: string; password?: string; guestToken?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // Uniform error on any auth failure — never leak whether the email exists or
  // which field was wrong.
  const INVALID = 'Invalid email or password';

  if (!EMAIL_RE.test(email) || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: INVALID }, 401);
  }

  let guestId: string | null;
  try {
    guestId = await resolveGuestId(body.guestToken, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: 'Invalid guest token' }, 401);
  }

  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    const dbUser = await db.query.users.findFirst({
      where: and(eq(sql`lower(${users.email})`, email), isNotNull(users.passwordHash)),
    });

    if (!dbUser?.passwordHash) {
      return c.json({ error: INVALID }, 401);
    }

    const ok = await verifyPassword(password, dbUser.passwordHash);
    if (!ok) {
      return c.json({ error: INVALID }, 401);
    }

    if (guestId) {
      await migrateGuestData(db, guestId, dbUser.id);
    }

    const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

    return c.json({ sessionToken, user: toUserShape(dbUser) });
  } catch (e) {
    console.error('[auth/login]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// NOTE: No password-reset flow yet — there is no transactional email infra in
// the project. When email sending is added, wire up POST /auth/password/reset
// (request a token) and a token-verification endpoint here.

// ── Current user ───────────────────────────────────────────────────────────
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!dbUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: toUserShape(dbUser) });
  } catch (e) {
    console.error('[auth/me GET]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});


// ── Change password (credential accounts) ──────────────────────────────────
// Authenticated change for email/password accounts: verify the current password,
// then store a fresh PBKDF2 hash. Distinct from a *reset* flow (still blocked on
// transactional email). Google/guest accounts have no password to change.
authRoutes.patch('/password', authMiddleware, async (c) => {
  const userId = c.get('userId');

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

    const dbUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!dbUser?.passwordHash) {
      // Google/guest accounts, or a deleted user — no credential to change.
      return c.json({ error: 'This account has no password to change' }, 400);
    }

    const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!ok) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

    return c.json({ success: true });
  } catch (e) {
    console.error('[auth/password PATCH]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

// ── Delete account (and all associated data) ───────────────────────────────
// Required by Google Play for apps with account creation. Every user-owned table
// FKs to users.id with onDelete: 'cascade', so deleting the user row removes all
// of their exercises, disciplines, partners, routines, sessions, sets, weight
// logs, fights and promotions in one shot.
authRoutes.delete('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);
    await db.delete(users).where(eq(users.id, userId));
    return c.body(null, 204);
  } catch (e) {
    console.error('[auth/me DELETE]', e);
    return c.json({ error: 'Internal error' }, 500);
  }
});

export { authRoutes };
