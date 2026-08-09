import { StyleSheet, Text, View } from 'react-native';
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
import { EmptyState, Section, SectionHeader, Touchable } from '../ui';
import { F, R, ThemeColors } from '../../theme/colors';
import { TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';

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
    <Section>
      <SectionHeader
        title="New PRs"
        subtitle={rangeLabel}
        icon="ribbon-outline"
        iconTone="gold"
        right={
          !isPro && !proLoading ? (
            <Touchable
              onPress={showPaywall}
              feedback="row"
              haptic={false}
              hitSlop={8}
              accessibilityLabel="PR tracking is a Pro feature — upgrade to unlock"
            >
              <Ionicons name="lock-closed" size={16} color={T.muted} />
            </Touchable>
          ) : undefined
        }
      />

      {!isPro && !proLoading ? (
        <Touchable
          onPress={showPaywall}
          feedback="cta"
          haptic={false}
          accessibilityLabel="Upgrade to Pro to track your PRs"
        >
          <View style={styles.proBlur}>
            <Text style={styles.proBlurText}>Upgrade to Pro to track your PRs</Text>
          </View>
        </Touchable>
      ) : state === 'error' ? (
        <InlineError message="Couldn't load your PRs." onRetry={() => void refetch()} />
      ) : state === 'loading' || proLoading ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={44} radius={R.sm} />
          ))}
        </View>
      ) : records.length === 0 ? (
        // Deliberately not phrased as a failure: most weeks contain no PR, and a
        // training log shouldn't scold you for a maintenance block.
        <EmptyState title="No new records in this range — widen it, or go set one." />
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
              <Touchable
                key={`${pr.exerciseId}-${pr.date}`}
                style={[styles.row, i < records.length - 1 && styles.rowBorder]}
                onPress={() =>
                  router.push({
                    pathname: '/history/exercise/[id]',
                    params: { id: pr.exerciseId, name: pr.exerciseName },
                  } as never)
                }
                feedback="row"
                haptic={false}
                hasTextChild
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
              </Touchable>
            );
          })}
        </View>
      )}
    </Section>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    name: { ...TYPE.body, fontFamily: F.uiSemi, color: T.text },
    meta: { fontFamily: F.mono, fontSize: 11, color: T.muted, marginTop: 2 },
    right: { alignItems: 'flex-end' },
    e1rm: { ...TYPE.numSm, color: T.text },
    delta: { ...TYPE.micro, fontFamily: F.uiSemi, color: T.conditioning, marginTop: 2 },
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
