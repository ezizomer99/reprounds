import { useRouter } from 'expo-router';
import { useSubscription } from '../context/SubscriptionContext';
import { useCurrentUser } from './useAuth';

export function useProGate() {
  const { isPro, isLoading: subLoading } = useSubscription();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const router = useRouter();

  // Comp status is computed server-side and returned on the user (single source of
  // truth in backend/src/lib/entitlements.ts) — never hardcode the allowlist here.
  const isComped = user?.isComped ?? false;

  function showPaywall() {
    router.push('/paywall' as never);
  }

  // `isLoading` covers BOTH the store entitlement and /me (comp status) — the gate
  // isn't resolved until both settle. A screen that locks content must not derive
  // that lock while this is true: a false `isPro` mid-race is indistinguishable
  // from a genuine free user, and a lock captured then can outlive the race.
  return { isPro: isPro || isComped, isLoading: subLoading || userLoading, showPaywall };
}
