import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRecentNotes } from '../../hooks/useNotes';
import { Skeleton } from '../Skeleton';
import { D, F, R, ThemeColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { withAlpha } from '../../lib/color';

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Latest session/technique/round notes with a link to the full timeline. */
export function RecentNotesCard() {
  const router = useRouter();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { data, isLoading } = useRecentNotes(3);

  const groups = data?.groups ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.cardIconBox, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
            <Ionicons name="document-text-outline" size={16} color={T.gold} />
          </View>
          <Text style={styles.cardTitle}>Recent Notes</Text>
        </View>
        <TouchableOpacity
          style={styles.seeAllBtn}
          onPress={() => router.push('/notes' as never)}
          activeOpacity={0.7}
        >
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={T.muted} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ gap: 8 }}>
          <Skeleton width="100%" height={48} radius={8} />
          <Skeleton width="100%" height={48} radius={8} />
        </View>
      ) : groups.length === 0 ? (
        <Text style={styles.emptyText}>
          Notes you add to sessions and rounds will show up here.
        </Text>
      ) : (
        <View>
          {groups.map((group, gi) => {
            const preview = group.notes.slice(0, 2);
            return (
              <TouchableOpacity
                key={group.sessionId}
                style={[styles.noteRow, gi < groups.length - 1 && styles.noteRowBorder]}
                onPress={() =>
                  router.push({ pathname: '/sessions/[id]', params: { id: group.sessionId } } as never)
                }
                activeOpacity={0.7}
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
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardIconBox: {
      width: 28,
      height: 28,
      borderRadius: R.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text },
    seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    seeAllText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },

    noteRow: { paddingVertical: 10 },
    noteRowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    noteRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    noteDate: { fontFamily: F.monoBold, fontSize: 11, color: T.muted },
    noteSession: { fontFamily: F.uiSemi, fontSize: 13, color: T.text, flexShrink: 1 },
    noteLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },
    noteText: { fontFamily: F.uiMed, fontSize: 13, color: T.text, marginTop: 1, lineHeight: 18 },
    noteMore: { fontFamily: F.uiMed, fontSize: 11, color: T.muted, marginTop: 6 },

    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, paddingVertical: 12 },
  });
}
