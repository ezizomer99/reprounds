import { useRouter } from 'expo-router';
import { useSubscription } from '../context/SubscriptionContext';
import { useCurrentUser } from './useAuth';

export function useProGate() {
  const { isPro, isLoading } = useSubscription();
  const { data: user } = useCurrentUser();
  const router = useRouter();

  // Comp status is computed server-side and returned on the user (single source of
  // truth in backend/src/lib/entitlements.ts) — never hardcode the allowlist here.
  const isComped = user?.isComped ?? false;

  function showPaywall() {
    router.push('/paywall' as never);
  }

  return { isPro: isPro || isComped, isLoading, showPaywall };
}
