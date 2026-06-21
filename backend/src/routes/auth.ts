import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { users, exercises, disciplines, fights, partners, rankPromotions, routines, sessions, weightLogs } from '../db/schema';
import { verifyGoogleIdToken } from '../lib/googleAuth';
import { signJwt } from '../lib/jwt';
import { authMiddleware } from '../middleware/auth';
import type { User } from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: {
    userId: string;
  };
};

const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function toUserShape(dbUser: { id: string; email: string | null; name: string | null; avatarUrl: string | null; isGuest: boolean }): User {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? null,
    avatarUrl: dbUser.avatarUrl ?? null,
    isGuest: dbUser.isGuest,
  };
}

const authRoutes = new Hono<Env>();

// ── Guest sign-in ──────────────────────────────────────────────────────────
authRoutes.post('/guest', async (c) => {
  let body: { deviceId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.deviceId || typeof body.deviceId !== 'string' || body.deviceId.length < 8) {
    return c.json({ error: 'deviceId is required' }, 400);
  }

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
});

// ── Google sign-in (with optional guest migration) ─────────────────────────
authRoutes.post('/google', async (c) => {
  let body: { idToken?: string; guestUserId?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.idToken) {
    return c.json({ error: 'idToken is required' }, 400);
  }

  let googlePayload: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    googlePayload = await verifyGoogleIdToken(body.idToken, c.env.GOOGLE_CLIENT_ID);
  } catch {
    return c.json({ error: 'Invalid Google ID token' }, 401);
  }

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

  // Migrate guest data if a guestUserId was provided
  if (body.guestUserId && typeof body.guestUserId === 'string') {
    const guestUser = await db.query.users.findFirst({
      where: eq(users.id, body.guestUserId),
    });

    if (guestUser?.isGuest && guestUser.id !== dbUser.id) {
      // Reassign all guest-owned data to the real user
      await db.update(exercises).set({ userId: dbUser.id }).where(eq(exercises.userId, guestUser.id));
      await db.update(disciplines).set({ userId: dbUser.id }).where(eq(disciplines.userId, guestUser.id));
      await db.update(partners).set({ userId: dbUser.id }).where(eq(partners.userId, guestUser.id));
      await db.update(fights).set({ userId: dbUser.id }).where(eq(fights.userId, guestUser.id));
      await db.update(rankPromotions).set({ userId: dbUser.id }).where(eq(rankPromotions.userId, guestUser.id));
      await db.update(weightLogs).set({ userId: dbUser.id }).where(eq(weightLogs.userId, guestUser.id));
      await db.update(routines).set({ userId: dbUser.id }).where(eq(routines.userId, guestUser.id));
      await db.update(sessions).set({ userId: dbUser.id }).where(eq(sessions.userId, guestUser.id));
      // session_entries and strength_sets cascade through sessions/routines — no direct user_id
      await db.delete(users).where(eq(users.id, guestUser.id));
    }
  }

  const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

  return c.json({ sessionToken, user: toUserShape(dbUser) });
});

// ── Current user ───────────────────────────────────────────────────────────
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user: toUserShape(dbUser) });
});

export { authRoutes };
