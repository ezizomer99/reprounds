import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { users } from '../db/schema';
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

const authRoutes = new Hono<Env>();

authRoutes.post('/google', async (c) => {
  let body: { idToken?: string };
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

  const [dbUser] = await db
    .insert(users)
    .values({
      googleSub: googlePayload.sub,
      email: googlePayload.email,
      name: googlePayload.name || null,
      avatarUrl: googlePayload.picture || null,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: googlePayload.email,
        name: googlePayload.name || null,
        avatarUrl: googlePayload.picture || null,
      },
    })
    .returning();

  const sessionToken = await signJwt({ sub: dbUser.id }, c.env.JWT_SECRET, SESSION_EXPIRY_SECONDS);

  const user: User = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? null,
    avatarUrl: dbUser.avatarUrl ?? null,
  };

  return c.json({ sessionToken, user });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  const user: User = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? null,
    avatarUrl: dbUser.avatarUrl ?? null,
  };

  return c.json({ user });
});

export { authRoutes };
