// Shared Hono environment type for every route group. Previously each route file
// re-declared an identical `type Env`; this is the single source. Routes that
// need extra bindings intersect onto AppEnv (see AuthEnv for the rate limiter).

export type AppEnv = {
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

// Auth routes additionally use the Workers Rate Limiting binding.
export type AuthEnv = AppEnv & {
  Bindings: AppEnv['Bindings'] & {
    AUTH_RATE_LIMITER?: RateLimit;
  };
};
