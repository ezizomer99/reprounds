import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { exerciseRoutes } from './routes/exercises';
import { disciplineRoutes } from './routes/disciplines';
import { templateRoutes } from './routes/templates';
import { sessionRoutes } from './routes/sessions';
import { scheduleRuleRoutes } from './routes/schedule-rules';
import { calendarRoutes } from './routes/calendar';

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
app.route('/v1/exercises', exerciseRoutes);
app.route('/v1/disciplines', disciplineRoutes);
app.route('/v1/templates', templateRoutes);
app.route('/v1/sessions', sessionRoutes);
app.route('/v1/schedule-rules', scheduleRuleRoutes);
app.route('/v1/calendar', calendarRoutes);

export default app;
