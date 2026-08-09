import { readPreference, writePreference } from './preferences';

/**
 * The last entitlement answer the store gave, remembered across launches so an
 * unreachable store falls back to what was true last time rather than to
 * "not subscribed". See `entitlementState.ts` for why that matters.
 *
 * Stored through the same preferences layer as the weight unit — this is a
 * cached display fact, not a credential, and it is not what authorizes
 * anything (see the note in `entitlementState.ts` about client-side gating).
 */

const STORE_KEY = 'pro_entitlement';

/** The remembered answer, or null when nothing has been stored yet. */
export async function readCachedEntitlement(): Promise<boolean | null> {
  const raw = await readPreference(STORE_KEY);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export async function writeCachedEntitlement(isPro: boolean): Promise<void> {
  await writePreference(STORE_KEY, isPro ? '1' : '0');
}

/**
 * Forget the remembered answer.
 *
 * Signing out normally detaches the RevenueCat customer, which reports the new
 * anonymous (non-Pro) state and overwrites the cache on its own. But that call
 * is best-effort and swallows its errors, so a sign-out while offline would
 * leave one account's Pro status cached for whoever signs in next. Sign-out and
 * account deletion clear it explicitly for that reason.
 */
export async function clearCachedEntitlement(): Promise<void> {
  await writePreference(STORE_KEY, '');
}
