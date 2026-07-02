import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineWithItems } from '@app/shared';
import { useDeleteRoutine, useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { Skeleton } from '../../../src/components/Skeleton';

const FREE_ROUTINE_LIMIT = 2;

interface RoutineRowProps {
  routine: RoutineWithItems;
  onPress: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

function RoutineRow({ routine, onPress, onDelete }: RoutineRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const hasMartialArts = routine.items.some((i) => i.kind === 'martial_arts');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(routine.id)}
      onLongPress={() => onDelete(routine.id, routine.name)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconAvatar, hasMartialArts && styles.iconAvatarMat]}>
        {hasMartialArts ? (
          <Ionicons name="flash" size={18} color={T.grappling} />
        ) : (
          <Ionicons name="barbell" size={18} color={T.textDim} />
        )}
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowName}>{routine.name}</Text>
        <Text style={styles.rowMeta}>
          {routine.items.length} item{routine.items.length !== 1 ? 's' : ''}
          {routine.dayLabel ? ` · ${routine.dayLabel}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={T.muted} />
    </TouchableOpacity>
  );
}

export default function RoutinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { data: routines, isLoading, isError, error } = useRoutines();
  const deleteRoutine = useDeleteRoutine();

  function handleDelete(id: string, name: string) {
    Alert.alert(
      'Delete routine',
      `Remove "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteRoutine.mutate(id, {
              onError: (err) => Alert.alert('Error', err.message ?? 'Failed to delete routine.'),
            });
          },
        },
      ],
    );
  }

  const list = routines ?? [];

  function handleNewRoutine() {
    if (!isPro && list.length >= FREE_ROUTINE_LIMIT) {
      Alert.alert(
        'Limit reached',
        `Free accounts can create up to ${FREE_ROUTINE_LIMIT} routines. Upgrade to RepRounds Pro for unlimited routines.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: showPaywall },
        ],
      );
      return;
    }
    router.push({ pathname: '/routines/[id]', params: { id: 'new' } });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Routines</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>{list.length} routine{list.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleNewRoutine}
        >
          <Ionicons name="add" size={18} color={T.onPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={{ paddingTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="45%" height={15} />
                <Skeleton width="65%" height={11} />
              </View>
              <Skeleton width={32} height={32} radius={R.sm} />
            </View>
          ))}
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error?.message ?? 'Failed to load routines.'}</Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RoutineRow
              routine={item}
              onPress={(id) => router.push({ pathname: '/routines/[id]', params: { id } })}
              onDelete={handleDelete}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No routines yet.</Text>
              <Text style={styles.emptySub}>Tap + to create one.</Text>
            </View>
          }
          contentContainerStyle={[
            list.length === 0 && { flex: 1 },
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
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
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
    addBtn: {
      width: 36, height: 36, borderRadius: R.sm,
      backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: D.pad, paddingVertical: 14,
    },
    iconAvatar: {
      width: 40, height: 40, borderRadius: R.sm,
      backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    },
    iconAvatarMat: { backgroundColor: withAlpha(T.grappling, 0.12) },
    rowContent: { flex: 1 },
    rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
    rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    separator: { height: 1, backgroundColor: T.border, marginLeft: D.pad + 40 + 12 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
    emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center', paddingHorizontal: 24 },
  });
}
