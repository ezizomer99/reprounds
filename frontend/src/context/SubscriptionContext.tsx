import { createContext, useContext, useEffect, useState } from 'react';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { useCurrentUser } from '../hooks/useAuth';

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
  customerInfo: CustomerInfo | null;
  // Localized store price strings (e.g. "$39.99"), or null until offerings load
  // or if the package isn't configured. The paywall shows a fallback when null.
  prices: { monthly: string | null; annual: string | null };
  purchasePro: (packageId: ProPackageId) => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPro: false,
  isLoading: true,
  customerInfo: null,
  prices: { monthly: null, annual: null },
  purchasePro: async () => {},
  restorePurchases: async () => {},
});

function isProFromInfo(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [configured, setConfigured] = useState(false);
  const { data: user } = useCurrentUser();

  function applyInfo(info: CustomerInfo) {
    setIsPro(isProFromInfo(info));
    setCustomerInfo(info);
  }

  useEffect(() => {
    const apiKey = Platform.OS === 'android' ? ANDROID_KEY : IOS_KEY;
    if (!apiKey) {
      setIsLoading(false);
      return;
    }

    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    setConfigured(true);

    Purchases.getCustomerInfo()
      .then(applyInfo)
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // Prefetch offerings so the paywall can show real localized prices without a
    // spinner. Best-effort — the paywall falls back gracefully when null.
    Purchases.getOfferings()
      .then((o) => setOffering(o.current))
      .catch(() => {});

    Purchases.addCustomerInfoUpdateListener(applyInfo);

    return () => { Purchases.removeCustomerInfoUpdateListener(applyInfo); };
  }, []);

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

  async function restorePurchases() {
    const info = await Purchases.restorePurchases();
    applyInfo(info);
  }

  const prices = {
    monthly: findPackage(offering, 'reprounds_pro_monthly')?.product.priceString ?? null,
    annual: findPackage(offering, 'reprounds_pro_annual')?.product.priceString ?? null,
  };

  return (
    <SubscriptionContext.Provider
      value={{ isPro, isLoading, customerInfo, prices, purchasePro, restorePurchases }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
