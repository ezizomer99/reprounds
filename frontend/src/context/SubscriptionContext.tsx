import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { useCurrentUser } from '../hooks/useAuth';
import { resolveEntitlement, type EntitlementSource } from '../lib/entitlementState';
import { readCachedEntitlement, writeCachedEntitlement } from '../lib/entitlementCache';

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const PRO_ENTITLEMENT = 'pro';

export type ProPackageId = 'reprounds_pro_monthly' | 'reprounds_pro_annual';

// Google subscription identifiers come back as "productId:basePlanId", so match
// on the product id prefix as well as the exact id. Shared by price display and
// the purchase flow so the two never disagree on which package is which.
function findPackage(
  offering: PurchasesOffering | null | undefined,
  packageId: ProPackageId,
): PurchasesPackage | undefined {
  return offering?.availablePackages.find(
    (p) => p.product.identifier === packageId || p.product.identifier.startsWith(`${packageId}:`),
  );
}

type SubscriptionContextValue = {
  isPro: boolean;
  isLoading: boolean;
  /**
   * The entitlement check failed or couldn't run. `isPro` then reflects the
   * last answer the store gave rather than the truth, so a screen must not
   * present it as "you are not subscribed" — see entitlementState.ts.
   */
  unavailable: boolean;
  /** Where the current `isPro` came from, for the subscription screen's copy. */
  entitlementSource: EntitlementSource;
  /** Re-run the entitlement check after a failure. */
  refreshEntitlement: () => Promise<void>;
  customerInfo: CustomerInfo | null;
  // Localized store price strings (e.g. "$39.99"), or null until offerings load
  // or if the package isn't configured. The paywall shows a fallback when null.
  prices: { monthly: string | null; annual: string | null };
  /** The offerings fetch failed, so `prices` will stay null until retried. */
  pricesUnavailable: boolean;
  /** Re-fetch offerings after a failure. */
  refreshPrices: () => Promise<void>;
  purchasePro: (packageId: ProPackageId) => Promise<void>;
  /** Resolves true when a Pro entitlement was actually restored. */
  restorePurchases: () => Promise<boolean>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPro: false,
  isLoading: true,
  unavailable: false,
  entitlementSource: 'none',
  refreshEntitlement: async () => {},
  customerInfo: null,
  prices: { monthly: null, annual: null },
  pricesUnavailable: false,
  refreshPrices: async () => {},
  purchasePro: async () => {},
  restorePurchases: async () => false,
});

function isProFromInfo(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  // What the store said, or null while unanswered. Deliberately tri-state: the
  // old boolean couldn't express "haven't heard back", which is what let a
  // failure read as a genuine free user.
  const [storeIsPro, setStoreIsPro] = useState<boolean | null>(null);
  const [storeFailed, setStoreFailed] = useState(false);
  const [cachedIsPro, setCachedIsPro] = useState<boolean | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [pricesUnavailable, setPricesUnavailable] = useState(false);
  const [configured, setConfigured] = useState(false);
  const { data: user } = useCurrentUser();

  const applyInfo = useCallback((info: CustomerInfo) => {
    const pro = isProFromInfo(info);
    setStoreIsPro(pro);
    setStoreFailed(false);
    setCustomerInfo(info);
    // Remembered so the next launch has something better than `false` to fall
    // back on if the store can't be reached.
    void writeCachedEntitlement(pro);
  }, []);

  // Seed from the remembered answer before the store is even asked, so a
  // returning subscriber is never rendered as free while the round-trip runs.
  useEffect(() => {
    void readCachedEntitlement().then(setCachedIsPro);
  }, []);

  const loadCustomerInfo = useCallback(async () => {
    try {
      applyInfo(await Purchases.getCustomerInfo());
    } catch {
      setStoreFailed(true);
    }
  }, [applyInfo]);

  const loadOfferings = useCallback(async () => {
    try {
      const o = await Purchases.getOfferings();
      setOffering(o.current);
      // A configured account with no current offering is a misconfiguration,
      // not a transient failure, but it leaves prices null just the same — so
      // the paywall needs to know either way.
      setPricesUnavailable(o.current === null);
    } catch {
      setPricesUnavailable(true);
    }
  }, []);

  useEffect(() => {
    const apiKey = Platform.OS === 'android' ? ANDROID_KEY : IOS_KEY;
    if (!apiKey) {
      // Nothing to check against. This is "couldn't determine", not "free" —
      // treating it as free is how a build with a missing env var silently
      // stripped every paying user of what they'd bought.
      setStoreFailed(true);
      setPricesUnavailable(true);
      return;
    }

    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    setConfigured(true);

    void loadCustomerInfo();
    // Prefetched so the paywall can show real localized prices without a spinner.
    void loadOfferings();

    Purchases.addCustomerInfoUpdateListener(applyInfo);

    return () => { Purchases.removeCustomerInfoUpdateListener(applyInfo); };
  }, [applyInfo, loadCustomerInfo, loadOfferings]);

  // Identify the RevenueCat customer with our user id + email so subscriptions
  // survive reinstalls/device switches and customers are searchable by email in
  // the RevenueCat dashboard (e.g. to grant promotional entitlements). Guests
  // are identified by id too; on sign-out we detach to a fresh anonymous user
  // so the next account doesn't inherit this one's entitlements.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    async function identify() {
      try {
        if (user) {
          const { customerInfo: info } = await Purchases.logIn(user.id);
          if (cancelled) return;
          applyInfo(info);
          if (user.email) await Purchases.setEmail(user.email);
          if (user.name) await Purchases.setDisplayName(user.name);
        } else if (!(await Purchases.isAnonymous())) {
          const info = await Purchases.logOut();
          if (!cancelled) applyInfo(info);
        }
      } catch {
        // Identification is best-effort; purchases still work anonymously.
      }
    }

    void identify();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, user?.id]);

  async function purchasePro(packageId: ProPackageId) {
    // Always fetch fresh offerings at purchase time; the prefetched copy is only
    // for display and may be stale.
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) throw new Error('No offerings available.');
    if (current !== offering) setOffering(current);
    const pkg = findPackage(current, packageId);
    if (!pkg) throw new Error('Package not found.');
    const { customerInfo: info } = await Purchases.purchasePackage(pkg);
    applyInfo(info);
  }

  /**
   * Returns whether a Pro entitlement actually came back. The screen used to
   * announce "your subscription has been restored" purely because the call
   * didn't throw — which it doesn't when there was nothing to restore.
   */
  async function restorePurchases(): Promise<boolean> {
    const info = await Purchases.restorePurchases();
    applyInfo(info);
    return isProFromInfo(info);
  }

  const prices = {
    monthly: findPackage(offering, 'reprounds_pro_monthly')?.product.priceString ?? null,
    annual: findPackage(offering, 'reprounds_pro_annual')?.product.priceString ?? null,
  };

  const entitlement = resolveEntitlement({ storeIsPro, storeFailed, cachedIsPro });

  return (
    <SubscriptionContext.Provider
      value={{
        isPro: entitlement.isPro,
        isLoading: entitlement.isLoading,
        unavailable: entitlement.unavailable,
        entitlementSource: entitlement.source,
        refreshEntitlement: loadCustomerInfo,
        customerInfo,
        prices,
        pricesUnavailable,
        refreshPrices: loadOfferings,
        purchasePro,
        restorePurchases,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
