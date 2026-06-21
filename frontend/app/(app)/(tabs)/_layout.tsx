import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { F, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { useActiveSession } from '../../../src/hooks/useSession';

export default function TabLayout() {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { activeSession } = useActiveSession();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: T.surface,
            borderTopColor: T.border,
            borderTopWidth: 1,
            height: 60,
          },
          tabBarActiveTintColor: T.primary,
          tabBarInactiveTintColor: T.muted,
          tabBarLabelStyle: { fontFamily: F.uiMed, fontSize: 11, marginTop: -2 },
        }}
      >
        <Tabs.Screen
          name="workout"
          options={{
            title: 'Workout',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="barbell-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="journal"
          options={{
            title: 'Journal',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="journal-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Statistics',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="mat"
          options={{
            title: 'Martial Arts',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="body-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {activeSession && (
        <TouchableOpacity
          style={styles.resumeBtn}
          onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: activeSession.id } } as never)}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-up" size={18} color={T.onPrimary} />
          <Text style={styles.resumeBtnText}>Resume Session</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    resumeBtn: {
      position: 'absolute',
      bottom: 76,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: T.primary,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 32,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    resumeBtnText: {
      fontFamily: F.uiBold,
      color: T.onPrimary,
      fontSize: 16,
    },
  });
}
