import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@app/shared';
import { useSessions } from '../../../src/hooks/useSession';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

type StatsTab = 'overview' | 'weekly' | 'this_week';

const STATS_TABS: { label: string; value: StatsTab }[] = [
  { label: 'Overview', value: 'overview' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'This Week', value: 'this_week' },
];

function sessionsThisWeek(sessions: Session[]): number {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return sessions.filter((s) => new Date(s.date + 'T00:00:00') >= monday).length;
}

function avgPerWeek(sessions: Session[], weeks = 4): number {
  if (!sessions.length) return 0;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - weeks * 7);
  const recent = sessions.filter((s) => new Date(s.date + 'T00:00:00') >= cutoff);
  return Math.round((recent.length / weeks) * 10) / 10;
}

interface CategoryCardProps {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  chips: string[];
  onPress: () => void;
}

function CategoryCard({
  iconName,
  iconBg,
  iconColor,
  title,
  subtitle,
  chips,
  onPress,
}: CategoryCardProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <TouchableOpacity style={styles.catCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.catIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.catBody}>
        <View style={styles.catTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.catTitle}>{title}</Text>
            <Text style={styles.catSubtitle}>{subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={T.muted} />
        </View>
        <View style={styles.catChips}>
          {chips.map((c) => (
            <View key={c} style={styles.catChip}>
              <Text style={styles.catChipText}>{c}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function StatsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');

  const { data: sessions, isLoading } = useSessions('completed');

  const thisWeek = useMemo(
    () => (sessions ? sessionsThisWeek(sessions) : 0),
    [sessions],
  );
  const avg = useMemo(
    () => (sessions ? avgPerWeek(sessions) : 0),
    [sessions],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Highlights card */}
        <View style={styles.card}>
          <View style={styles.highlightsLabel}>
            <Ionicons name="star-outline" size={16} color={T.gold} />
            <Text style={styles.highlightsTitle}>Highlights</Text>
          </View>

          {/* Tab switcher */}
          <View style={styles.tabSwitcher}>
            {STATS_TABS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[styles.tabBtn, activeTab === value && styles.tabBtnActive]}
                onPress={() => setActiveTab(value)}
              >
                <Text style={[styles.tabBtnText, activeTab === value && styles.tabBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Stat cards row */}
          {isLoading ? (
            <ActivityIndicator color={T.primary} style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.statCardsRow}>
              <View style={[styles.statCard, { backgroundColor: withAlpha(T.primary, 0.12) }]}>
                <Text style={[styles.statCardNum, { color: T.primary }]}>{thisWeek}</Text>
                <Text style={[styles.statCardLabel, { color: T.primary }]}>This Week</Text>
              </View>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: withAlpha(T.conditioning, 0.12) }]}
                onPress={isPro ? undefined : showPaywall}
                activeOpacity={isPro ? 1 : 0.7}
              >
                {isPro ? (
                  <>
                    <Text style={[styles.statCardNum, { color: T.conditioning }]}>{avg}</Text>
                    <Text style={[styles.statCardLabel, { color: T.conditioning }]}>Avg/Week</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={T.conditioning} />
                    <Text style={[styles.statCardLabel, { color: T.conditioning }]}>Avg/Week</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: withAlpha(T.gold, 0.12) }]}
                onPress={isPro ? undefined : showPaywall}
                activeOpacity={isPro ? 1 : 0.7}
              >
                {isPro ? (
                  <>
                    <Text style={[styles.statCardNum, { color: T.gold }]}>0</Text>
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>PRs</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={T.gold} />
                    <Text style={[styles.statCardLabel, { color: T.gold }]}>PRs</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Category cards */}
        <CategoryCard
          iconName="pulse-outline"
          iconBg={withAlpha(T.conditioning, 0.2)}
          iconColor={T.conditioning}
          title="Activity"
          subtitle="Workout frequency and streaks"
          chips={isPro ? ['Frequency', 'Streaks'] : ['Frequency', 'Streaks 🔒']}
          onPress={() => isPro ? router.push('/history' as never) : showPaywall()}
        />

        <CategoryCard
          iconName="trending-up-outline"
          iconBg={withAlpha(T.performance, 0.2)}
          iconColor={T.performance}
          title="Performance"
          subtitle="Volume and personal records"
          chips={isPro ? ['Volume', 'History'] : ['Volume 🔒', 'History 🔒']}
          onPress={() => isPro ? router.push('/history' as never) : showPaywall()}
        />

        <CategoryCard
          iconName="person-outline"
          iconBg={withAlpha(T.primary, 0.18)}
          iconColor={T.primary}
          title="Body"
          subtitle="Muscle group distribution"
          chips={['Muscle Coverage']}
          onPress={() => Alert.alert('Coming soon', 'Muscle coverage tracking is coming in a future update.')}
        />
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      paddingHorizontal: D.pad,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    headerTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text, letterSpacing: -0.3 },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    card: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
    },

    highlightsLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 14,
    },
    highlightsTitle: { fontFamily: F.uiBold, fontSize: 16, color: T.text },

    tabSwitcher: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
    },
    tabBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
    },
    tabBtnActive: { backgroundColor: T.primary },
    tabBtnText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    tabBtnTextActive: { fontFamily: F.uiBold, color: T.onPrimary },

    statCardsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1,
      borderRadius: R.sm,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    statCardNum: { fontFamily: F.monoBold, fontSize: 24 },
    statCardLabel: { fontFamily: F.uiMed, fontSize: 11, textAlign: 'center' },

    catCard: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'flex-start',
    },
    catIconBox: {
      width: 48,
      height: 48,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    catBody: { flex: 1, gap: 10 },
    catTop: { flexDirection: 'row', alignItems: 'flex-start' },
    catTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginBottom: 2 },
    catSubtitle: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    catChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    catChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: R.chip,
      borderWidth: 1,
      borderColor: T.borderStrong,
    },
    catChipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
  });
}
