import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExercise } from '../../../src/hooks/useExercises';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = 280;

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();

  const { data: exercise, isLoading, isError } = useExercise(id ?? null);

  function handleHistory() {
    if (!isPro) { showPaywall(); return; }
    router.push({ pathname: '/history/exercise/[id]', params: { id, name: exercise?.name ?? '' } } as never);
  }

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.backRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      </View>
    );
  }

  if (isError || !exercise) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.backRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load exercise.</Text>
        </View>
      </View>
    );
  }

  const secondaryList = exercise.secondaryMuscles?.filter(Boolean).join(', ');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {exercise.imageUrl ? (
          <Image
            source={{ uri: exercise.imageUrl }}
            style={styles.hero}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]} />
        )}

        <View style={styles.body}>
          <Text style={styles.name}>{exercise.name}</Text>

          <View style={styles.badgeRow}>
            {exercise.equipment && (
              <View style={styles.badge}>
                <Ionicons name="barbell-outline" size={12} color={T.primary} />
                <Text style={styles.badgeText}>{exercise.equipment}</Text>
              </View>
            )}
            {exercise.muscleGroup && (
              <View style={styles.badge}>
                <Ionicons name="body-outline" size={12} color={T.primary} />
                <Text style={styles.badgeText}>{exercise.muscleGroup}</Text>
              </View>
            )}
            {exercise.category && (
              <View style={[styles.badge, styles.badgeAlt]}>
                <Text style={[styles.badgeText, styles.badgeAltText]}>{exercise.category}</Text>
              </View>
            )}
          </View>

          {secondaryList ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Also works</Text>
              <Text style={styles.bodyText}>{secondaryList}</Text>
            </View>
          ) : null}

          {exercise.instructions ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.bodyText}>{exercise.instructions}</Text>
            </View>
          ) : null}

          {exercise.instructionSteps && exercise.instructionSteps.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Steps</Text>
              {exercise.instructionSteps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.historyBtn}
            onPress={handleHistory}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={16} color={T.primary} />
            <Text style={styles.historyBtnText}>View History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger },

    backRow: {
      paddingHorizontal: D.pad,
      paddingVertical: 10,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(T.text, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },

    hero: {
      width: SCREEN_WIDTH,
      height: HERO_HEIGHT,
    },
    heroPlaceholder: {
      backgroundColor: T.surface2,
    },

    body: {
      padding: D.pad,
      gap: 4,
    },
    name: {
      fontFamily: F.uiBold,
      fontSize: 24,
      color: T.text,
      letterSpacing: -0.4,
      marginBottom: 10,
    },

    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 6,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.3),
      backgroundColor: withAlpha(T.primary, 0.08),
    },
    badgeText: {
      fontFamily: F.uiMed,
      fontSize: 12,
      color: T.primary,
      textTransform: 'capitalize',
    },
    badgeAlt: {
      borderColor: T.border,
      backgroundColor: T.surface,
    },
    badgeAltText: {
      color: T.textDim,
    },

    section: {
      marginTop: 20,
      gap: 10,
    },
    sectionLabel: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    bodyText: {
      fontFamily: F.ui,
      fontSize: 14,
      color: T.text,
      lineHeight: 22,
    },

    stepRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: withAlpha(T.primary, 0.15),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      flexShrink: 0,
    },
    stepNumberText: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.primary,
    },
    stepText: {
      flex: 1,
      fontFamily: F.ui,
      fontSize: 14,
      color: T.text,
      lineHeight: 22,
    },

    historyBtn: {
      marginTop: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: withAlpha(T.primary, 0.4),
      borderRadius: R.card,
      paddingVertical: 13,
    },
    historyBtnText: {
      fontFamily: F.uiSemi,
      fontSize: 15,
      color: T.primary,
    },
  });
}
