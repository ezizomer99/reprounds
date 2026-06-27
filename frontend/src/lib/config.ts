// Centralized runtime configuration, resolved from Expo public env vars.
//
// EXPO_PUBLIC_* values are inlined into the JS bundle at build time. Each EAS
// build profile sets its own values (see frontend/eas.json): development/preview
// point at the dev Worker, production points at the prod Worker. The fallbacks
// below keep `expo start` working locally without an .env file.

const DEV_API_ORIGIN = 'https://reprounds-api.oemerdigital.workers.dev';
const DEV_GOOGLE_WEB_CLIENT_ID =
  '548195273503-mkd114c10dkhhv90621j2o019pdkgvkm.apps.googleusercontent.com';

/** Origin of the API (no trailing slash, no version segment). */
export function resolveApiOrigin(env: Record<string, string | undefined> = process.env): string {
  const origin = env.EXPO_PUBLIC_API_URL?.trim() || DEV_API_ORIGIN;
  return origin.replace(/\/+$/, '');
}

/** Versioned API base URL, e.g. https://api.reprounds.app/v1 */
export function resolveApiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return `${resolveApiOrigin(env)}/v1`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || DEV_GOOGLE_WEB_CLIENT_ID;
