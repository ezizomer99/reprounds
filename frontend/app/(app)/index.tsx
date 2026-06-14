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

      <View style={styles.librarySection}>
        <Text style={styles.sectionLabel}>Library</Text>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/library/exercises')}
        >
          <Text style={styles.navItemText}>Exercise Library</Text>
          <Text style={styles.navItemArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/library/disciplines')}
        >
          <Text style={styles.navItemText}>Discipline Library</Text>
          <Text style={styles.navItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.librarySection}>
        <Text style={styles.sectionLabel}>Training</Text>
        <TouchableOpacity
          style={[styles.navItem, styles.logWorkoutItem]}
          onPress={() => router.push('/sessions/new' as never)}
        >
          <Text style={[styles.navItemText, styles.logWorkoutText]}>Log Workout</Text>
          <Text style={[styles.navItemArrow, styles.logWorkoutArrow]}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/calendar')}
        >
          <Text style={styles.navItemText}>Calendar</Text>
          <Text style={styles.navItemArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/history')}
        >
          <Text style={styles.navItemText}>History</Text>
          <Text style={styles.navItemArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/templates')}
        >
          <Text style={styles.navItemText}>Templates</Text>
          <Text style={styles.navItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

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
    marginBottom: 32,
  },
  librarySection: {
    width: '100%',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  navItemText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  navItemArrow: {
    fontSize: 20,
    color: '#9ca3af',
    lineHeight: 22,
  },
  logWorkoutItem: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  logWorkoutText: {
    color: '#fff',
    fontWeight: '700',
  },
  logWorkoutArrow: {
    color: 'rgba(255,255,255,0.7)',
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
