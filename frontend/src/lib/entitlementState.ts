/**
 * Deciding whether a user is Pro, in a way that survives the store being
 * unreachable.
 *
 * The old logic was `Purchases.getCustomerInfo().catch(() => {})` followed by
 * `isLoading = false`. A network blip, a RevenueCat outage or an unset API key
 * all produced exactly the same state a genuine free user produces — and since
 * nothing recorded that the check had *failed*, no screen could tell the two
 * apart. A paying subscriber quietly lost 30-day-plus history, exercise
 * history, the calendar and their raised limits, and was shown upgrade prompts
 * for something they had already bought.
 *
 * Two changes fix that. The last successful answer is remembered, so an
 * unreachable store falls back to what was true last time instead of to
 * `false`; and the failure is reported, so the subscription screen can say it
 * couldn't check rather than asserting "Free Plan".
 *
 * Falling *open* — treating unknown as Pro — would also stop the false
 * downgrade, but it hands every paid feature to anyone who blocks a hostname.
 * Last-known-good has no such hole. Note this is all client-side either way:
 * `backend/src/lib/entitlements.ts` documents that store entitlements are not
 * verified server-side, and the server's per-user caps are an abuse ceiling
 * rather than the paywall.
 */

/**
 * Persistence lives in `entitlementCache.ts` so this module stays free of
 * imports — it's the piece worth testing, and pulling AsyncStorage in through
 * the preferences layer would drag a native module into the test run.
 */

/** Where the current answer came from, for display and debugging. */
export type EntitlementSource = 'store' | 'cache' | 'none';

export interface EntitlementState {
  /** The best available answer to "is this user Pro". */
  isPro: boolean;
  source: EntitlementSource;
  /** The store check hasn't settled yet. */
  isLoading: boolean;
  /** The store check ran and failed, or could not run at all. */
  unavailable: boolean;
}

export interface EntitlementInput {
  /** What the store said, or null if it hasn't answered yet. */
  storeIsPro: boolean | null;
  /** The store check failed, or there was no API key to check with. */
  storeFailed: boolean;
  /** The last answer the store gave on a previous run, or null if none. */
  cachedIsPro: boolean | null;
}

/**
 * Fold the store's answer, its failure state and the remembered answer into one
 * verdict.
 *
 * The cached value is used while loading as well as after a failure. That is
 * what removes the cold-start flash: a returning subscriber reads Pro from the
 * first frame instead of rendering a locked screen for as long as the network
 * round-trip takes.
 */
export function resolveEntitlement({
  storeIsPro,
  storeFailed,
  cachedIsPro,
}: EntitlementInput): EntitlementState {
  // A fresh answer always wins, even over a failure recorded earlier.
  if (storeIsPro !== null) {
    return { isPro: storeIsPro, source: 'store', isLoading: false, unavailable: false };
  }

  const fallback = cachedIsPro ?? false;
  const source: EntitlementSource = cachedIsPro !== null ? 'cache' : 'none';

  if (storeFailed) {
    return { isPro: fallback, source, isLoading: false, unavailable: true };
  }
  return { isPro: fallback, source, isLoading: true, unavailable: false };
}
