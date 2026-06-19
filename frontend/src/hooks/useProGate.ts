import { useRouter } from 'expo-router';
import { useSubscription } from '../context/SubscriptionContext';
import { useCurrentUser } from './useAuth';

const COMP_EMAILS = ['ezizomer1999@gmail.com'];

export function useProGate() {
  const { isPro, isLoading } = useSubscription();
  const { data: user } = useCurrentUser();
  const router = useRouter();

  const isComped = user?.email ? COMP_EMAILS.includes(user.email) : false;

  function showPaywall() {
    router.push('/paywall' as never);
  }

  return { isPro: isPro || isComped, isLoading, showPaywall };
}
