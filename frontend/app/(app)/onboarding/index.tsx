import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineTemplate } from '@app/shared';
import { useCompleteOnboarding } from '../../../src/hooks/useAuth';
import { useUnit } from '../../../src/units/UnitContext';
import type { WeightUnit } from '../../../src/units/units';
import { useNotificationsEnabled } from '../../../src/notifications/NotificationsContext';
import { TemplateBrowseModal } from '../../../src/components/TemplateBrowseModal';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

type Goal = RoutineTemplate['goal'];

const GOALS: { key: Goal; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'gym', label: 'Lift weights', sub: 'Track gym workouts and PRs', icon: 'barbell-outline' },
  { key: 'martial_arts', label: 'Train martial arts', sub: 'Log rounds, sparring, techniques', icon: 'body-outline' },
  { key: 'both', label: 'Both', sub: 'Reps for the gym, rounds for the mat', icon: 'flash-outline' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { unit, setUnit } = useUnit();
  const { setNotificationsEnabled } = useNotificationsEnabled();
  const completeOnboarding = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  function finish() {
    // Fire the completion write (it optimistically flips the onboarded flag in
    // cache and retries in the background) and navigate SYNCHRONOUSLY. We must
    // not gate navigation on the request resolving: while offline the mutation
    // pauses and never settles, which previously left the user stuck on the
    // spinner — and the app-layout gate bounced them back whenever the flag
    // hadn't landed. The optimistic update keeps the gate satisfied.
    completeOnboarding.mutate();
    router.replace('/(app)/(tabs)/workout');
  }

  async function handleEnableNotifications() {
    await setNotificationsEnabled(true);
    finish();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.progress}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>

      {step === 0 && (
        <View style={styles.stepBody}>
          <Text style={styles.title}>What brings you here?</Text>
          <Text style={styles.subtitle}>We'll tailor your setup. You can always change this later.</Text>
          <View style={{ gap: 12, marginTop: 24 }}>
            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.key}
                style={[styles.goalCard, goal === g.key && styles.goalCardActive]}
                onPress={() => setGoal(g.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.goalIcon, goal === g.key && styles.goalIconActive]}>
                  <Ionicons name={g.icon} size={22} color={goal === g.key ? T.onPrimary : T.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalLabel}>{g.label}</Text>
                  <Text style={styles.goalSub}>{g.sub}</Text>
                </View>
                {goal === g.key && <Ionicons name="checkmark-circle" size={22} color={T.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View style={styles.stepBody}>
          <Text style={styles.title}>Which units do you use?</Text>
          <Text style={styles.subtitle}>For weights and body measurements.</Text>
          <View style={styles.unitRow}>
            {(['kg', 'lbs'] as WeightUnit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                onPress={() => setUnit(u)}
                activeOpacity={0.85}
              >
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                  {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.stepBody}>
          <Text style={styles.title}>Stay on track</Text>
          <Text style={styles.subtitle}>
            Turn on notifications for rest-timer alerts and session reminders. You can skip this.
          </Text>
          <View style={{ gap: 12, marginTop: 24 }}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleEnableNotifications} activeOpacity={0.85}>
              <Ionicons name="notifications-outline" size={18} color={T.onPrimary} />
              <Text style={styles.primaryBtnText}>Enable notifications</Text>
            </TouchableOpacity>
            {goal !== 'martial_arts' && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowTemplates(true)} activeOpacity={0.85}>
                <Ionicons name="sparkles-outline" size={17} color={T.primary} />
                <Text style={styles.secondaryBtnText}>Set up my week from a template</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        {step > 0 ? (
          <TouchableOpacity onPress={() => setStep((s) => s - 1)} hitSlop={8}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        {step < 2 ? (
          <TouchableOpacity
            style={[styles.nextBtn, step === 0 && !goal && { opacity: 0.4 }]}
            onPress={() => setStep((s) => s + 1)}
            disabled={step === 0 && !goal}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={17} color={T.onPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} onPress={finish} disabled={completeOnboarding.isPending} activeOpacity={0.85}>
            {completeOnboarding.isPending
              ? <ActivityIndicator size="small" color={T.onPrimary} />
              : <Text style={styles.nextBtnText}>Skip for now</Text>}
          </TouchableOpacity>
        )}
      </View>

      <TemplateBrowseModal
        visible={showTemplates}
        goalFilter={goal ?? undefined}
        onClose={() => setShowTemplates(false)}
        onCreated={finish}
      />
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg, paddingHorizontal: D.pad },
    progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 12 },
    dot: { width: 28, height: 4, borderRadius: 2, backgroundColor: T.surface2 },
    dotActive: { backgroundColor: T.primary },

    stepBody: { flex: 1, paddingTop: 24 },
    title: { fontFamily: F.uiBold, fontSize: 26, color: T.text, letterSpacing: -0.4 },
    subtitle: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim, marginTop: 8, lineHeight: 21 },

    goalCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      padding: 16, borderRadius: R.card,
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    },
    goalCardActive: { borderColor: T.primary, backgroundColor: withAlpha(T.primary, 0.06) },
    goalIcon: {
      width: 44, height: 44, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
      backgroundColor: withAlpha(T.primary, 0.14),
    },
    goalIconActive: { backgroundColor: T.primary },
    goalLabel: { fontFamily: F.uiSemi, fontSize: 16, color: T.text },
    goalSub: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 2 },

    unitRow: { gap: 12, marginTop: 24 },
    unitBtn: {
      padding: 18, borderRadius: R.card, alignItems: 'center',
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    },
    unitBtnActive: { borderColor: T.primary, backgroundColor: withAlpha(T.primary, 0.06) },
    unitText: { fontFamily: F.uiSemi, fontSize: 16, color: T.textDim },
    unitTextActive: { color: T.primary },

    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: T.primary, padding: 16, borderRadius: R.card,
    },
    primaryBtnText: { fontFamily: F.uiBold, fontSize: 16, color: T.onPrimary },
    secondaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: 16, borderRadius: R.card,
      backgroundColor: withAlpha(T.primary, 0.1), borderWidth: 1, borderColor: withAlpha(T.primary, 0.25),
    },
    secondaryBtnText: { fontFamily: F.uiSemi, fontSize: 15, color: T.primary },

    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
    backText: { fontFamily: F.uiMed, fontSize: 15, color: T.textDim, paddingVertical: 8, paddingHorizontal: 4 },
    nextBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: T.primary, paddingVertical: 12, paddingHorizontal: 22, borderRadius: R.chip,
    },
    nextBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
