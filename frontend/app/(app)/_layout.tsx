import { Stack, useRouter, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { View, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useCurrentUser();

  const needsOnboarding = !!user && !user.onboardedAt;
  const onOnboarding = pathname === '/onboarding';

  useEffect(() => {
    if (isLoading) return;

    if (isError || !user) {
      router.replace('/(auth)/sign-in');
    } else if (needsOnboarding && !onOnboarding) {
      router.replace('/onboarding');
    }
  }, [isLoading, isError, user, needsOnboarding, onOnboarding, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !user) {
    return null;
  }

  // Hold the UI on a spinner while redirecting into onboarding so the tabs
  // don't flash behind the redirect.
  if (needsOnboarding && !onOnboarding) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
