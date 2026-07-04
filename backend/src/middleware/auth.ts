import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { verifyJwt } from '../lib/jwt';
import { createDb } from '../db';
import { users } from '../db/schema';

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

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = header.slice(7);

  let userId: string;
  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    userId = payload.sub;
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // A JWT outlives account deletion (no revocation list), so a signature
  // check alone would let a deleted user's token authenticate for up to the
  // token lifetime. One indexed PK lookup closes that gap.
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!row) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', userId);
  await next();
});
