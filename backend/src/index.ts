import { Hono } from 'hono';
import { authRoutes } from './routes/auth';

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

const app = new Hono<Env>();

app.get('/', (c) => c.json({ status: 'ok', app: 'glima-api' }));

app.route('/v1/auth', authRoutes);

export default app;
