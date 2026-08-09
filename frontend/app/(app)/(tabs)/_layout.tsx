import { Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { F } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { useActiveSession } from '../../../src/hooks/useSession';
import { BrandedHeader } from '../../../src/components/BrandedHeader';
import { Button } from '../../../src/components/ui';

// Direction-aware slide between tabs: a scene's progress is -1 when it sits
// left of the focused tab, 0 when focused, +1 when right, so the outgoing and
// incoming scenes slide in opposite directions matching the tab order.
//
// Built per-render off the live window width rather than a module-level
// Dimensions.get() so the slide distance still matches the screen after a
// rotation or a foldable unfolding.
//
// Note: tab screens must NOT carry their own `entering` animation. A scene is
// mounted lazily on first visit, so an entering animation fires *during* this
// slide and the page appears to rise from below before sliding.
function makeSlideTransition(width: number) {
  return {
    animation: 'shift',
    transitionSpec: {
      animation: 'timing',
      config: { duration: 250, easing: Easing.out(Easing.cubic) },
    },
    sceneStyleInterpolator: ({ current }) => ({
      sceneStyle: {
        transform: [
          {
            translateX: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [-width, 0, width],
            }),
          },
        ],
      },
    }),
  } satisfies BottomTabNavigationOptions;
}

export default function TabLayout() {
  const router = useRouter();
  const { T } = useTheme();
  const styles = resumeStyles;
  const { activeSession } = useActiveSession();
  const { width } = useWindowDimensions();
  const slideTransition = useMemo(() => makeSlideTransition(width), [width]);

  return (
    <View style={{ flex: 1 }}>
      {/* Static branded header: rendered outside <Tabs> so the tab slide
          transform (which wraps each Screen's header + body) no longer moves
          it. Only the scene body slides during tab-to-tab navigation. */}
      <BrandedHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          ...slideTransition,
          sceneStyle: { backgroundColor: T.bg },
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
        <Button
          label="Resume Session"
          icon="chevron-up"
          variant="hero"
          fullWidth={false}
          style={styles.resumeBtnWrap}
          onPress={() => router.push({ pathname: '/sessions/[id]', params: { id: activeSession.id } } as never)}
          accessibilityLabel="Resume active session"
        />
      )}
    </View>
  );
}

// Position only — Button owns every colour here, so there is nothing
// theme-dependent left to rebuild per theme.
const resumeStyles = StyleSheet.create({
  resumeBtnWrap: {
    position: 'absolute',
    bottom: 76,
    alignSelf: 'center',
  },
});
