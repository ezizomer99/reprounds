import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { clearSessionToken } from '../../src/lib/auth';

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  async function handleSignOut() {
    await clearSessionToken();
    await GoogleSignin.signOut();
    queryClient.clear();
    router.replace('/(auth)/sign-in');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Glima</Text>
      {user && (
        <>
          <Text style={styles.name}>{user.name ?? user.email}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </>
      )}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 48,
  },
  signOutButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  signOutText: {
    fontSize: 14,
    color: '#333',
  },
});
