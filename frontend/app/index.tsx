import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getSessionToken } from '../src/lib/auth';

export default function RootIndex() {
  const [destination, setDestination] = useState<'/(app)' | '/(auth)/sign-in' | null>(null);

  useEffect(() => {
    getSessionToken().then((token) => {
      setDestination(token ? '/(app)' : '/(auth)/sign-in');
    });
  }, []);

  if (!destination) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
