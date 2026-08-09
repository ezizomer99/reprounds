import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { RoutineWithItems } from '@app/shared';
import { useDeleteRoutine, useReorderRoutines, useRoutines } from '../../../src/hooks/useRoutines';
import { useProGate } from '../../../src/hooks/useProGate';
import { Touchable } from '../../../src/components/ui';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';
import { Skeleton } from '../../../src/components/Skeleton';
import { InlineError } from '../../../src/components/InlineError';

const FREE_ROUTINE_LIMIT = 2;

interface RoutineRowProps {
  routine: RoutineWithItems;
  onPress: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  drag?: () => void;
  isActive?: boolean;
}

function RoutineRow({ routine, onPress, onDelete, drag, isActive }: RoutineRowProps) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const hasMartialArts = routine.items.some((i) => i.kind === 'martial_arts');

  return (
    <View style={[styles.row, isActive && styles.rowActive]}>
      {/* Drag is bound to the handle only, so the row's own long-press (delete)
          and the handle's long-press (drag) never contend for the gesture. */}
      <Touchable
        onLongPress={() => {
          if (!drag) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          drag();
        }}
        delayLongPress={120}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        style={styles.gripHandle}
        disabled={!drag}
        accessibilityLabel={`Reorder ${routine.name}`}
        accessibilityHint="Press and hold, then drag up or down"
        feedback="row"
      >
        <Ionicons name="reorder-three-outline" size={20} color={isActive ? T.primary : T.muted} />
      </Touchable>
      <Touchable
        style={styles.rowMain}
        onPress={() => onPress(routine.id)}
        onLongPress={() => onDelete(routine.id, routine.name)}
        feedback="row"
        hasTextChild
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
      </Touchable>
    </View>
  );
}

export default function RoutinesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, isLoading: gateLoading, showPaywall } = useProGate();
  const { data: routines, isLoading, isError, refetch } = useRoutines();
  const deleteRoutine = useDeleteRoutine();
  const reorderRoutines = useReorderRoutines();

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
    // See exercises/index.tsx — don't enforce a limit on an unresolved gate.
    if (!isPro && !gateLoading && list.length >= FREE_ROUTINE_LIMIT) {
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
        <Touchable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </Touchable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Routines</Text>
          {list.length > 0 && (
            <Text style={styles.headerSub}>{list.length} routine{list.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <Touchable
          style={styles.addBtn}
          onPress={handleNewRoutine}
          accessibilityLabel="Create a routine"
        >
          <Ionicons name="add" size={18} color={T.onPrimary} />
        </Touchable>
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
        <InlineError
          message="Couldn't load your routines."
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && (
        <DraggableFlatList
          data={list}
          keyExtractor={(item) => item.id}
          onDragEnd={({ data }) =>
            reorderRoutines.mutate(
              { order: data.map((r) => r.id) },
              { onError: (err) => Alert.alert('Error', err.message ?? 'Failed to reorder routines.') },
            )
          }
          containerStyle={{ flex: 1 }}
          activationDistance={12}
          autoscrollThreshold={80}
          renderItem={({ item, drag, isActive }: RenderItemParams<RoutineWithItems>) => (
            <ScaleDecorator>
              <RoutineRow
                routine={item}
                onPress={(id) => router.push({ pathname: '/routines/[id]', params: { id } })}
                onDelete={handleDelete}
                drag={list.length > 1 ? drag : undefined}
                isActive={isActive}
              />
            </ScaleDecorator>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>No routines yet.</Text>
              <Text style={styles.emptySub}>Tap + to create one.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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
      borderBottomWidth: 2, borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text, letterSpacing: -0.2 },
    headerSub: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 1 },
    addBtn: {
      width: 36, height: 36, borderRadius: R.sm,
      backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: D.pad, paddingVertical: 14,
      // Opaque, and the divider lives on the row rather than in a separator so
      // it travels with the row while it is being dragged.
      backgroundColor: T.bg,
      borderBottomWidth: 1, borderBottomColor: T.border,
    },
    rowActive: { backgroundColor: T.surface2 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    gripHandle: {
      width: 34, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8,
    },
    iconAvatar: {
      width: 40, height: 40, borderRadius: R.sm,
      backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center',
    },
    iconAvatarMat: { backgroundColor: withAlpha(T.grappling, 0.12) },
    rowContent: { flex: 1 },
    rowName: { fontFamily: F.uiMed, fontSize: 15, color: T.text, marginBottom: 2 },
    rowMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
    emptyBlock: { alignItems: 'center', paddingVertical: 48 },

    skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: D.pad, paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim, marginBottom: 4 },
    emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center', paddingHorizontal: 24 },
  });
}
