import { resolveEntitlement } from './entitlementState';

describe('resolveEntitlement', () => {
  describe('when the store has answered', () => {
    it('trusts a Pro answer', () => {
      expect(resolveEntitlement({ storeIsPro: true, storeFailed: false, cachedIsPro: null })).toEqual({
        isPro: true,
        source: 'store',
        isLoading: false,
        unavailable: false,
      });
    });

    it('trusts a not-Pro answer over a stale cached Pro', () => {
      // A lapsed subscription must actually lapse — the cache is a fallback,
      // never an override.
      expect(resolveEntitlement({ storeIsPro: false, storeFailed: false, cachedIsPro: true })).toEqual({
        isPro: false,
        source: 'store',
        isLoading: false,
        unavailable: false,
      });
    });

    it('lets a late answer clear an earlier failure', () => {
      const state = resolveEntitlement({ storeIsPro: true, storeFailed: true, cachedIsPro: false });
      expect(state.isPro).toBe(true);
      expect(state.unavailable).toBe(false);
    });
  });

  describe('while the store is still answering', () => {
    it('reports loading and falls back to the cached answer', () => {
      // The whole point: a returning subscriber reads Pro from the first frame
      // instead of rendering a locked screen for the length of a round-trip.
      expect(resolveEntitlement({ storeIsPro: null, storeFailed: false, cachedIsPro: true })).toEqual({
        isPro: true,
        source: 'cache',
        isLoading: true,
        unavailable: false,
      });
    });

    it('reports loading and not-Pro when nothing is cached', () => {
      expect(resolveEntitlement({ storeIsPro: null, storeFailed: false, cachedIsPro: null })).toEqual({
        isPro: false,
        source: 'none',
        isLoading: true,
        unavailable: false,
      });
    });
  });

  describe('when the store is unreachable', () => {
    it('keeps a subscriber subscribed', () => {
      expect(resolveEntitlement({ storeIsPro: null, storeFailed: true, cachedIsPro: true })).toEqual({
        isPro: true,
        source: 'cache',
        isLoading: false,
        unavailable: true,
      });
    });

    it('keeps a free user free', () => {
      expect(resolveEntitlement({ storeIsPro: null, storeFailed: true, cachedIsPro: false })).toEqual({
        isPro: false,
        source: 'cache',
        isLoading: false,
        unavailable: true,
      });
    });

    it('does not invent an entitlement when nothing is cached', () => {
      // Failing open here would hand every paid feature to anyone who blocks
      // the store's hostname.
      expect(resolveEntitlement({ storeIsPro: null, storeFailed: true, cachedIsPro: null })).toEqual({
        isPro: false,
        source: 'none',
        isLoading: false,
        unavailable: true,
      });
    });

    it('is never both loading and unavailable', () => {
      const state = resolveEntitlement({ storeIsPro: null, storeFailed: true, cachedIsPro: true });
      expect(state.isLoading && state.unavailable).toBe(false);
    });
  });
});
