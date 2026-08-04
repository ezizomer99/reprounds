export * from './types/enums';
export * from './types/fieldConfig';
export * from './types/rounds';
export * from './types/models';
export * from './calculators/oneRepMax';
export * from './calculators/volume';
export * from './validators';
export * from './limits';

// Paywall thresholds. These are enforced CLIENT-SIDE ONLY, and deliberately so:
// the Worker has no way to tell a paying Pro user from a free one. Comped
// accounts are known server-side (backend/src/lib/entitlements.ts), but genuine
// entitlement comes from RevenueCat and is verified on the device — so a
// server-side check against these numbers would reject a paying subscriber's
// 4th custom exercise. Enforcing the paywall on the server is blocked on
// server-side purchase verification; until that lands, treat these as UI gates.
export const FREE_CUSTOM_EXERCISE_LIMIT = 3;
export const FREE_CUSTOM_TECHNIQUE_LIMIT = 5;

// Hard per-user ceilings, enforced server-side. These are NOT the paywall —
// they sit far above anything a real user (free or Pro) would ever reach, and
// exist so that custom-row creation has some bound at all. Without them a
// scripted client could insert unboundedly against an authenticated session.
export const MAX_CUSTOM_EXERCISES_PER_USER = 1_000;
export const MAX_CUSTOM_TECHNIQUES_PER_USER = 1_000;
