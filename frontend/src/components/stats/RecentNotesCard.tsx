import { StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useRecentNotes } from '../../hooks/useNotes';
import { cardState } from '../../lib/statsHelpers';
import { Skeleton } from '../Skeleton';
import { InlineError } from '../InlineError';
import { EmptyState, Section, SectionHeader, Touchable } from '../ui';
import { F, R, ThemeColors } from '../../theme/colors';
import { TYPE } from '../../theme/type';
import { useTheme } from '../../theme/ThemeContext';
import { parseLocalDate } from '../../lib/calendar';

function fmtDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Latest session/technique/round notes with a link to the full timeline. */
export function RecentNotesCard() {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data, isError, refetch } = useRecentNotes(3);
  // Data beats an error: the cache is persisted, so a failed background refetch
  // used to replace notes the user could still read with "Couldn't load".
  const state = cardState(!!data, isError);

  const groups = data?.groups ?? [];

  return (
    <Section>
      <SectionHeader
        title="Recent Notes"
        icon="document-text-outline"
        iconTone="gold"
        action={{
          label: 'View all',
          onPress: () => router.push('/notes' as never),
          accessibilityLabel: 'View all notes',
        }}
      />

      {state === 'loading' ? (
        <View style={{ gap: 8 }}>
          <Skeleton width="100%" height={48} radius={R.sm} />
          <Skeleton width="100%" height={48} radius={R.sm} />
        </View>
      ) : state === 'error' ? (
        <InlineError message="Couldn't load your recent notes." onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState title="Notes you add to sessions and rounds will show up here." />
      ) : (
        <View>
          {groups.map((group, gi) => {
            const preview = group.notes.slice(0, 2);
            return (
              <Touchable
                key={group.sessionId}
                style={[styles.noteRow, gi < groups.length - 1 && styles.noteRowBorder]}
                onPress={() =>
                  router.push({ pathname: '/sessions/[id]', params: { id: group.sessionId } } as never)
                }
                feedback="row"
                haptic={false}
                accessibilityLabel={`Notes from ${fmtDate(group.date)}${group.sessionName ? `, ${group.sessionName}` : ''}`}
              >
                <View style={styles.noteRowTop}>
                  <Text style={styles.noteDate}>{fmtDate(group.date)}</Text>
                  {group.sessionName ? (
                    <Text style={styles.noteSession} numberOfLines={1}>
                      {group.sessionName}
                    </Text>
                  ) : null}
                </View>
                {preview.map((note, ni) => (
                  <View key={ni} style={{ marginTop: ni === 0 ? 4 : 6 }}>
                    <Text style={styles.noteLabel}>{note.label}</Text>
                    <Text style={styles.noteText} numberOfLines={2}>
                      {note.text}
                    </Text>
                  </View>
                ))}
                {group.notes.length > preview.length && (
                  <Text style={styles.noteMore}>
                    +{group.notes.length - preview.length} more
                  </Text>
                )}
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
    noteRow: { paddingVertical: 10 },
    noteRowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    noteRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noteDate: { fontFamily: F.monoBold, fontSize: 11, color: T.muted },
    noteSession: { fontFamily: F.uiSemi, fontSize: 13, color: T.text, flexShrink: 1 },
    noteLabel: { ...TYPE.micro, color: T.textDim },
    noteText: { fontFamily: F.uiMed, fontSize: 13, color: T.text, marginTop: 1, lineHeight: 18 },
    noteMore: { ...TYPE.micro, color: T.muted, marginTop: 6 },
  });
}
