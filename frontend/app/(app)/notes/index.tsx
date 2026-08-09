import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NotesSessionGroup } from '@app/shared';
import { useNotesTimeline, useTechniqueTags } from '../../../src/hooks/useNotes';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { Skeleton } from '../../../src/components/Skeleton';
import { InlineError } from '../../../src/components/InlineError';
import { Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { parseLocalDate } from '../../../src/lib/calendar';

function formatDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function NotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { data: tagData } = useTechniqueTags();
  const tags = tagData?.tags ?? [];

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useNotesTimeline({
      tag: activeTag,
      q: debouncedSearch || null,
    });
  const groups = useMemo(() => data?.pages.flatMap((p) => p.groups) ?? [], [data]);
  const filtering = !!activeTag || debouncedSearch.length > 0;

  const renderGroup = ({ item }: { item: NotesSessionGroup }) => {
    const isMat = item.kinds.includes('martial_arts');
    const isGym = item.kinds.includes('exercise');
    return (
      <Touchable
        style={styles.groupCard}
        onPress={() =>
          router.push({ pathname: '/sessions/[id]', params: { id: item.sessionId } } as never)
        }
        feedback="card"
        hasTextChild
      >
        <View style={styles.groupHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupDate}>{formatDate(item.date)}</Text>
            <Text style={styles.groupName} numberOfLines={1}>
              {item.sessionName ?? 'Workout'}
            </Text>
          </View>
          <View style={styles.badgeRow}>
            {isMat && (
              <View style={[styles.badge, { backgroundColor: withAlpha(T.grappling, 0.15) }]}>
                <Text style={[styles.badgeText, { color: T.grappling }]}>Mat</Text>
              </View>
            )}
            {isGym && (
              <View style={[styles.badge, { backgroundColor: withAlpha(T.primary, 0.15) }]}>
                <Text style={[styles.badgeText, { color: T.primary }]}>Gym</Text>
              </View>
            )}
          </View>
        </View>

        {item.notes.map((note, i) => (
          <View key={i} style={[styles.noteItem, i === 0 && { marginTop: 8 }]}>
            <Text style={styles.noteLabel}>{note.label}</Text>
            <Text style={styles.noteText} numberOfLines={4}>
              {note.text}
            </Text>
          </View>
        ))}
      </Touchable>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
        <Text style={styles.headerTitle}>Notes</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={T.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes…"
          placeholderTextColor={T.muted}
          returnKeyType="search"
          selectionColor={T.primary}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Touchable onPress={() => setSearch('')} hitSlop={8} haptic={false} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={T.muted} />
          </Touchable>
        )}
      </View>

      {tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagRow}
        >
          {tags.map((t) => {
            const active = activeTag === t.tag;
            return (
              <Touchable
                key={t.tag}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => setActiveTag(active ? null : t.tag)}
                feedback="card"
                hasTextChild
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                  {t.tag}
                </Text>
              </Touchable>
            );
          })}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={{ padding: D.pad, gap: D.stack }}>
          <Skeleton width="100%" height={110} radius={R.card} />
          <Skeleton width="100%" height={110} radius={R.card} />
          <Skeleton width="100%" height={110} radius={R.card} />
        </View>
      ) : isError && groups.length === 0 ? (
        // Was indistinguishable from having written no notes.
        <InlineError
          message="Couldn't load your notes."
          onRetry={() => { void refetch(); }}
        />
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={filtering ? 'search-outline' : 'document-text-outline'} size={36} color={T.muted} />
          <Text style={styles.emptyTitle}>{filtering ? 'No matching notes' : 'No notes yet'}</Text>
          <Text style={styles.emptyText}>
            {filtering
              ? 'Try a different search or clear the tag filter.'
              : 'Notes you add to sessions, techniques, and rounds will collect here for looking back.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.sessionId}
          renderItem={renderGroup}
          contentContainerStyle={{ padding: D.pad, gap: D.stack, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={T.muted} style={{ paddingVertical: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      marginHorizontal: D.pad, marginTop: 12, paddingHorizontal: 12,
    },
    searchInput: { flex: 1, fontFamily: F.uiMed, fontSize: 14, color: T.text, paddingVertical: 10 },

    tagRow: { gap: 6, paddingHorizontal: D.pad, paddingVertical: 10 },
    tagChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.chip,
      backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border,
    },
    tagChipActive: { backgroundColor: withAlpha(T.primary, 0.15), borderColor: withAlpha(T.primary, 0.4) },
    tagChipText: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    tagChipTextActive: { color: T.primary, fontFamily: F.uiSemi },

    groupCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingTop: 12,
      paddingBottom: 4,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupDate: { fontFamily: F.monoBold, fontSize: 11, color: T.muted },
    groupName: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, marginTop: 2 },
    badgeRow: { flexDirection: 'row', gap: 6 },
    badge: { borderRadius: R.chip, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontFamily: F.uiSemi, fontSize: 11 },

    noteItem: { marginTop: 10 },
    noteLabel: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim },
    noteText: { fontFamily: F.uiMed, fontSize: 13, color: T.text, marginTop: 2, lineHeight: 19 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
    emptyTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    emptyText: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center', lineHeight: 19 },
  });
}
