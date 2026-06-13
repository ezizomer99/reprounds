import { createMiddleware } from 'hono/factory';
import { verifyJwt } from '../lib/jwt';

type Env = {
  Bindings: {
    HYPERDRIVE: Hyperdrive;
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

  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});
