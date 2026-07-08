import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { exerciseRoutes } from './routes/exercises';
import { disciplineRoutes } from './routes/disciplines';
import { fightRoutes } from './routes/fights';
import { partnerRoutes } from './routes/partners';
import { promotionRoutes } from './routes/promotions';
import { routineRoutes } from './routes/routines';
import { sessionRoutes } from './routes/sessions';
import { weightRoutes } from './routes/weights';
import { statsRoutes } from './routes/stats';
import { notesRoutes } from './routes/notes';

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

// Uniform 500 shape for anything a handler didn't catch (DB/Hyperdrive
// failures included) — without this, workerd returns a platform-shaped
// response that doesn't match the { error } contract the app parses.
app.onError((err, c) => {
  console.error(`unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'Internal error' }, 500);
});

app.get('/', (c) => c.json({ status: 'ok', app: 'reprounds-api' }));

app.route('/v1/auth', authRoutes);
app.route('/v1/exercises', exerciseRoutes);
app.route('/v1/disciplines', disciplineRoutes);
app.route('/v1/fights', fightRoutes);
app.route('/v1/partners', partnerRoutes);
app.route('/v1/promotions', promotionRoutes);
app.route('/v1/routines', routineRoutes);
app.route('/v1/sessions', sessionRoutes);
app.route('/v1/weights', weightRoutes);
app.route('/v1/stats', statsRoutes);
app.route('/v1/notes', notesRoutes);

export default app;
