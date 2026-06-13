import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { View, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;

    if (isError || !user) {
      router.replace('/(auth)/sign-in');
    }
  }, [isLoading, isError, user, router]);

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
