import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePersonalRecords } from '../../hooks/useStats';
import { useProGate } from '../../hooks/useProGate';
import { useUnit } from '../../units/UnitContext';
import { fmtWeight } from '../../units/units';
import { parseLocalDate } from '../../lib/calendar';
import { cardState } from '../../lib/statsHelpers';
import { Skeleton } from '../Skeleton';
import { InlineError } from '../InlineError';
import { F, R, ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';

export interface PRFeedCardProps {
  /** Window start (local ISO date) — records are measured against everything before it. */
  since: string;
  /**
   * Exclusive window end (local ISO date).
   *
   * Session dates are accepted arbitrarily far into the future, and this feed
   * orders by date descending — so without a ceiling a workout logged with a
   * mistyped year became the first "new PR" in the list.
   */
  until: string;
  /** Human label for that window, e.g. "Last 8 weeks". */
  rangeLabel: string;
}

function fmtDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Lifts improved on during the selected range.
 *
 * A card rather than a Highlights tile: the third tile is the week streak, and a
 * PR is worth more than a count — which lift, by how much, and when.
 */
export function PRFeedCard({ since, until, rangeLabel }: PRFeedCardProps) {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: proLoading, showPaywall } = useProGate();
  const { unit } = useUnit();

  const { data, isError, refetch } = usePersonalRecords(since, until, isPro && !proLoading);
  const state = cardState(!!data, isError);
  const records = data?.records ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
            <Ionicons name="ribbon-outline" size={16} color={T.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>New PRs</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{rangeLabel}</Text>
          </View>
        </View>
        {!isPro && !proLoading && (
          <TouchableOpacity
            onPress={showPaywall}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="PR tracking is a Pro feature — upgrade to unlock"
          >
            <Ionicons name="lock-closed" size={16} color={T.muted} />
          </TouchableOpacity>
        )}
      </View>

      {!isPro && !proLoading ? (
        <TouchableOpacity onPress={showPaywall} activeOpacity={0.85}>
          <View style={styles.proBlur}>
            <Text style={styles.proBlurText}>Upgrade to Pro to track your PRs</Text>
          </View>
        </TouchableOpacity>
      ) : state === 'error' ? (
        <InlineError message="Couldn't load your PRs." onRetry={() => void refetch()} />
      ) : state === 'loading' || proLoading ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={44} radius={8} />
          ))}
        </View>
      ) : records.length === 0 ? (
        // Deliberately not phrased as a failure: most weeks contain no PR, and a
        // training log shouldn't scold you for a maintenance block.
        <Text style={styles.emptyText}>
          No new records in this range — widen it, or go set one.
        </Text>
      ) : (
        <View style={{ marginTop: 4 }}>
          {records.map((pr, i) => {
            const gain =
              // Subtract in kg and convert once. Converting each side first and
              // then rounding the difference rounded twice, so a genuine
              // improvement could land on "+0.0".
              pr.previousOneRepMax !== null
                ? pr.estimatedOneRepMax - pr.previousOneRepMax
                : null;
            return (
              <TouchableOpacity
                key={`${pr.exerciseId}-${pr.date}`}
                style={[styles.row, i < records.length - 1 && styles.rowBorder]}
                onPress={() =>
                  router.push({
                    pathname: '/history/exercise/[id]',
                    params: { id: pr.exerciseId, name: pr.exerciseName },
                  } as never)
                }
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {pr.exerciseName}
                  </Text>
                  <Text style={styles.meta}>
                    {fmtWeight(pr.weight, unit)} {unit} × {pr.reps} · {fmtDate(pr.date)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.e1rm}>
                    {fmtWeight(pr.estimatedOneRepMax, unit)} {unit}
                  </Text>
                  {/* A first-ever lift has nothing to beat, so it gets its own
                      label rather than a meaningless "+0". The gain carries its
                      unit: a bare "+2.5" sat directly under a line reading
                      "225 lbs" and read as kg to half the audience. */}
                  <Text style={[styles.delta, gain === null && { color: T.muted }]}>
                    {gain === null ? 'New lift' : `+${fmtWeight(gain, unit)} ${unit}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 14,
      paddingBottom: 4,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    cardIconBox: {
      width: 28,
      height: 28,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontFamily: F.uiBold,
      fontSize: 12,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    cardSub: { fontFamily: F.ui, fontSize: 11, color: T.muted, marginTop: 2 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    name: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    meta: { fontFamily: F.mono, fontSize: 11, color: T.muted, marginTop: 2 },
    right: { alignItems: 'flex-end' },
    e1rm: { fontFamily: F.monoBold, fontSize: 14, color: T.text },
    delta: { fontFamily: F.uiSemi, fontSize: 11, color: T.conditioning, marginTop: 2 },

    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, paddingVertical: 12 },
    // Matches the paywall blocks on the sibling cards in stats.tsx.
    proBlur: {
      backgroundColor: T.surface2,
      borderRadius: R.sm,
      paddingVertical: 20,
      alignItems: 'center',
      marginTop: 4,
    },
    proBlurText: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.muted,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
  });
}
