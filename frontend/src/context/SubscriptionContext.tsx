import { createContext, useContext, useEffect, useState } from 'react';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const PRO_ENTITLEMENT = 'pro';

type SubscriptionContextValue = {
  isPro: boolean;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  purchasePro: (packageId: 'glima_pro_monthly' | 'glima_pro_annual') => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  isPro: false,
  isLoading: true,
  customerInfo: null,
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

    Purchases.getCustomerInfo()
      .then(applyInfo)
      .catch(() => {})
      .finally(() => setIsLoading(false));

    Purchases.addCustomerInfoUpdateListener(applyInfo);

    return () => { Purchases.removeCustomerInfoUpdateListener(applyInfo); };
  }, []);

  async function purchasePro(packageId: 'glima_pro_monthly' | 'glima_pro_annual') {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) throw new Error('No offerings available.');
    const pkg = current.availablePackages.find((p) => p.product.identifier === packageId);
    if (!pkg) throw new Error('Package not found.');
    const { customerInfo: info } = await Purchases.purchasePackage(pkg);
    applyInfo(info);
  }

  async function restorePurchases() {
    const info = await Purchases.restorePurchases();
    applyInfo(info);
  }

  return (
    <SubscriptionContext.Provider value={{ isPro, isLoading, customerInfo, purchasePro, restorePurchases }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
