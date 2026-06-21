import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Fight, FightMethod, FightResult, RankPromotion } from '@app/shared';
import { isRoundsSession } from '@app/shared';
import { useDisciplineHistory, useDisciplines } from '../../../src/hooks/useDisciplines';
import { fightRecord, useCreateFight, useDeleteFight, useFights } from '../../../src/hooks/useFights';
import { useCreatePromotion, useDeletePromotion, usePromotions } from '../../../src/hooks/usePromotions';
import { useProGate } from '../../../src/hooks/useProGate';
import { F, R, D, ThemeColors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { withAlpha } from '../../../src/lib/color';

function formatDate(dateStr: string): { day: string; month: string; year: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}

function getMaDetails(entry: { details: Record<string, unknown> | null }) {
  // Structured round sessions: summarize rounds + class type, surface the journal.
  if (isRoundsSession(entry.details)) {
    const r = entry.details;
    const n = r.rounds?.length ?? 0;
    const parts: string[] = [];
    if (n) parts.push(`${n} round${n !== 1 ? 's' : ''}`);
    if (r.classType) parts.push(r.classType.replace(/_/g, ' '));
    return { title: parts.join(' · ') || 'Session', notes: r.techniqueNotes?.trim() || null };
  }
  // Legacy field_config sessions.
  const d = entry.details as Record<string, string> | null;
  return { title: d?.title?.trim() || null, notes: d?.notes?.trim() || null };
}

export default function DisciplineDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { isPro, showPaywall } = useProGate();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const { data, isLoading, isError, error } = useDisciplineHistory(id ?? null);
  const { data: fights } = useFights(id ?? null);
  const deleteFight = useDeleteFight(id ?? null);
  const [showAddFight, setShowAddFight] = useState(false);

  const { data: disciplines } = useDisciplines();
  const discipline = disciplines?.find((d) => d.id === id);
  const isGrappling = discipline?.category === 'grappling';
  const { data: promotions } = usePromotions(id ?? null);
  const deletePromotion = useDeletePromotion(id ?? null);
  const [showAddPromo, setShowAddPromo] = useState(false);

  const history = data?.history ?? [];
  const fightList = fights ?? [];
  const record = fightRecord(fightList);
  const promoList = promotions ?? [];
  const currentRank = promoList[0] ?? null; // ordered by date desc

  if (!isPro) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{name ?? 'Discipline'}</Text>
          </View>
        </View>
        <View style={styles.proGateCentered}>
          <View style={styles.proGateCircle}>
            <Ionicons name="trophy" size={28} color={T.gold} />
          </View>
          <Text style={styles.proGateTitle}>Glima Pro Feature</Text>
          <Text style={styles.proGateSub}>
            Discipline history and session logs are available with Glima Pro.
          </Text>
          <TouchableOpacity style={styles.proGateBtn} onPress={showPaywall} activeOpacity={0.8}>
            <Text style={styles.proGateBtnText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }


  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name ?? 'Discipline'}
          </Text>
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.entry.id}
        ListHeaderComponent={
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{history.length}</Text>
                <Text style={styles.statKey}>Total sessions</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>
                  {record.wins}-{record.losses}-{record.draws}
                </Text>
                <Text style={styles.statKey}>Record (W-L-D)</Text>
              </View>
            </View>

            {isGrappling && (
              <>
                <View style={styles.compHead}>
                  <Text style={styles.sectionLabel}>Rank</Text>
                  <TouchableOpacity style={styles.logBtn} onPress={() => setShowAddPromo(true)}>
                    <Ionicons name="add" size={15} color={T.primary} />
                    <Text style={styles.logBtnText}>Add promotion</Text>
                  </TouchableOpacity>
                </View>
                {currentRank ? (
                  <View style={styles.rankCard}>
                    <View style={styles.rankCurrent}>
                      <Text style={styles.rankName}>{currentRank.rank}</Text>
                      {currentRank.stripes ? (
                        <View style={styles.stripeRow}>
                          {Array.from({ length: currentRank.stripes }).map((_, i) => (
                            <View key={i} style={styles.stripe} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                    {promoList.length > 1 && (
                      <Text style={styles.rankHistory}>
                        {promoList.length} promotion{promoList.length !== 1 ? 's' : ''} logged
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.compEmpty}>No promotions logged yet.</Text>
                )}
                {promoList.map((p) => (
                  <PromotionRow
                    key={p.id}
                    promotion={p}
                    onDelete={() =>
                      Alert.alert('Delete promotion?', 'This cannot be undone.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deletePromotion.mutate(p.id) },
                      ])
                    }
                  />
                ))}
              </>
            )}

            <View style={styles.compHead}>
              <Text style={styles.sectionLabel}>Competition</Text>
              <TouchableOpacity style={styles.logBtn} onPress={() => setShowAddFight(true)}>
                <Ionicons name="add" size={15} color={T.primary} />
                <Text style={styles.logBtnText}>Log result</Text>
              </TouchableOpacity>
            </View>
            {fightList.length === 0 ? (
              <Text style={styles.compEmpty}>No results logged yet.</Text>
            ) : (
              fightList.map((f) => (
                <FightRow
                  key={f.id}
                  fight={f}
                  onDelete={() =>
                    Alert.alert('Delete result?', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteFight.mutate(f.id) },
                    ])
                  }
                />
              ))
            )}

            {history.length > 0 && (
              <Text style={styles.sectionLabel}>Session history</Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          const { day, month, year } = formatDate(item.date);
          const { title, notes } = getMaDetails(item.entry);
          return (
            <TouchableOpacity
              style={styles.historyCard}
              onPress={() =>
                router.push({
                  pathname: '/sessions/[id]',
                  params: { id: item.sessionId },
                } as never)
              }
              activeOpacity={0.7}
            >
              <View style={styles.historyCardTop}>
                <View style={styles.dateBlock}>
                  <Text style={styles.dateDay}>{day}</Text>
                  <Text style={styles.dateMonth}>{month}</Text>
                  <Text style={styles.dateYear}>{year}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={T.muted} />
              </View>
              {title && (
                <Text style={styles.historyTitle} numberOfLines={1}>{title}</Text>
              )}
              {notes ? (
                <Text style={styles.historyNotes} numberOfLines={3}>{notes}</Text>
              ) : !title ? (
                <Text style={styles.historyEmpty}>No notes recorded.</Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: D.gap }} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={T.primary} />
            </View>
          ) : isError ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>
                {error?.message ?? 'Failed to load history.'}
              </Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Ionicons name="body-outline" size={40} color={T.muted} />
              <Text style={styles.emptyText}>No sessions logged yet.</Text>
              <Text style={styles.emptySub}>
                Start a workout and add {name ?? 'this discipline'} to see your history here.
              </Text>
            </View>
          )
        }
        contentContainerStyle={[
          history.length === 0 && !isLoading && { flex: 1 },
          { paddingBottom: insets.bottom + 32, paddingHorizontal: D.pad, gap: D.gap },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {showAddFight && id && (
        <AddFightModal disciplineId={id} onClose={() => setShowAddFight(false)} />
      )}
      {showAddPromo && id && (
        <AddPromotionModal disciplineId={id} onClose={() => setShowAddPromo(false)} />
      )}
    </View>
  );
}

// ─── Fight log ───────────────────────────────────────────────────────────────

const RESULTS: { value: FightResult; label: string }[] = [
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
  { value: 'draw', label: 'Draw' },
];

const METHODS: { value: FightMethod; label: string }[] = [
  { value: 'ko', label: 'KO' },
  { value: 'tko', label: 'TKO' },
  { value: 'submission', label: 'Submission' },
  { value: 'decision', label: 'Decision' },
  { value: 'points', label: 'Points' },
  { value: 'other', label: 'Other' },
];

const METHOD_LABEL: Record<FightMethod, string> = {
  ko: 'KO', tko: 'TKO', submission: 'Sub', decision: 'Decision', points: 'Points', other: 'Other',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function FightRow({ fight, onDelete }: { fight: Fight; onDelete: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { day, month, year } = formatDate(fight.date);
  const color = fight.result === 'win' ? T.conditioning : fight.result === 'loss' ? T.danger : T.muted;
  const letter = fight.result === 'win' ? 'W' : fight.result === 'loss' ? 'L' : 'D';
  const meta = [fight.method ? METHOD_LABEL[fight.method] : null, fight.round ? `R${fight.round}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.fightRow}>
      <View style={[styles.fightBadge, { backgroundColor: withAlpha(color, 0.15), borderColor: withAlpha(color, 0.35) }]}>
        <Text style={[styles.fightBadgeText, { color }]}>{letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fightOpp} numberOfLines={1}>{fight.opponent || 'Opponent'}</Text>
        <Text style={styles.fightMeta}>
          {`${month} ${day}, ${year}`}{meta ? ` · ${meta}` : ''}
        </Text>
      </View>
      <TouchableOpacity hitSlop={8} onPress={onDelete}>
        <Ionicons name="trash-outline" size={16} color={T.muted} />
      </TouchableOpacity>
    </View>
  );
}

function AddFightModal({ disciplineId, onClose }: { disciplineId: string; onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const createFight = useCreateFight();
  const [date, setDate] = useState(todayISO());
  const [opponent, setOpponent] = useState('');
  const [result, setResult] = useState<FightResult>('win');
  const [method, setMethod] = useState<FightMethod | null>(null);
  const [round, setRound] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSave() {
    try {
      await createFight.mutateAsync({
        disciplineId,
        date,
        opponent: opponent.trim() || null,
        result,
        method,
        round: round.trim() ? Number(round) : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save result.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Log result</Text>

          <Text style={styles.sheetLabel}>Result</Text>
          <View style={styles.chipRow}>
            {RESULTS.map((r) => {
              const active = result === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setResult(r.value)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Opponent</Text>
          <TextInput
            style={styles.sheetInput}
            value={opponent}
            onChangeText={setOpponent}
            placeholder="Name (optional)"
            placeholderTextColor={T.muted}
            autoCapitalize="words"
          />

          <Text style={styles.sheetLabel}>Date</Text>
          <TextInput
            style={styles.sheetInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
          />

          <Text style={styles.sheetLabel}>Method</Text>
          <View style={styles.chipRow}>
            {METHODS.map((m) => {
              const active = method === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setMethod(active ? null : m.value)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Round (optional)</Text>
          <TextInput
            style={styles.sheetInput}
            value={round}
            onChangeText={setRound}
            placeholder="e.g. 2"
            placeholderTextColor={T.muted}
            keyboardType="number-pad"
          />

          <Text style={styles.sheetLabel}>Notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.sheetTextarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={T.muted}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.saveBtn, createFight.isPending && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={createFight.isPending}
          >
            {createFight.isPending ? (
              <ActivityIndicator size="small" color={T.onPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save result</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Rank progression ────────────────────────────────────────────────────────

const BELTS = ['White', 'Blue', 'Purple', 'Brown', 'Black'];
const STRIPE_OPTS = [0, 1, 2, 3, 4];

function PromotionRow({ promotion, onDelete }: { promotion: RankPromotion; onDelete: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { day, month, year } = formatDate(promotion.date);
  const stripeText = promotion.stripes
    ? ` · ${promotion.stripes} stripe${promotion.stripes !== 1 ? 's' : ''}`
    : '';
  return (
    <View style={styles.fightRow}>
      <Ionicons name="ribbon-outline" size={20} color={T.gold} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fightOpp} numberOfLines={1}>{promotion.rank}{stripeText}</Text>
        <Text style={styles.fightMeta}>{`${month} ${day}, ${year}`}</Text>
      </View>
      <TouchableOpacity hitSlop={8} onPress={onDelete}>
        <Ionicons name="trash-outline" size={16} color={T.muted} />
      </TouchableOpacity>
    </View>
  );
}

function AddPromotionModal({ disciplineId, onClose }: { disciplineId: string; onClose: () => void }) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const createPromotion = useCreatePromotion();
  const [rank, setRank] = useState('');
  const [stripes, setStripes] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  async function handleSave() {
    if (!rank.trim()) {
      Alert.alert('Rank required', 'Pick or type a rank.');
      return;
    }
    try {
      await createPromotion.mutateAsync({
        disciplineId,
        rank: rank.trim(),
        stripes: stripes || null,
        date,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message ?? 'Failed to save promotion.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Add promotion</Text>

          <Text style={styles.sheetLabel}>Belt</Text>
          <View style={styles.chipRow}>
            {BELTS.map((b) => {
              const active = rank === b;
              return (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setRank(b)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Or type a rank</Text>
          <TextInput
            style={styles.sheetInput}
            value={rank}
            onChangeText={setRank}
            placeholder="e.g. Blue belt, 1st kyu"
            placeholderTextColor={T.muted}
            autoCapitalize="words"
          />

          <Text style={styles.sheetLabel}>Stripes</Text>
          <View style={styles.chipRow}>
            {STRIPE_OPTS.map((s) => {
              const active = stripes === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStripes(s)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Date</Text>
          <TextInput
            style={styles.sheetInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
          />

          <Text style={styles.sheetLabel}>Notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.sheetTextarea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={T.muted}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.saveBtn, createPromotion.isPending && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={createPromotion.isPending}
          >
            {createPromotion.isPending ? (
              <ActivityIndicator size="small" color={T.onPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save promotion</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiBold, fontSize: 19, color: T.text, letterSpacing: -0.2 },

    statsRow: {
      flexDirection: 'row',
      gap: 10,
      padding: D.pad,
      paddingBottom: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.sm,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 4,
    },
    statNum: { fontFamily: F.monoBold, fontSize: 22, color: T.text },
    statKey: { fontFamily: F.uiMed, fontSize: 11, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },

    sectionLabel: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      paddingHorizontal: D.pad,
      paddingTop: 8,
      paddingBottom: 4,
    },

    historyCard: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: R.card,
      padding: D.cardPad,
      gap: 6,
    },
    historyCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dateBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    dateDay: { fontFamily: F.monoBold, fontSize: 22, color: T.text },
    dateMonth: { fontFamily: F.uiBold, fontSize: 11, color: T.textDim, letterSpacing: 0.6 },
    dateYear: { fontFamily: F.uiMed, fontSize: 11, color: T.muted },
    historyTitle: { fontFamily: F.uiSemi, fontSize: 15, color: T.text, letterSpacing: -0.1 },
    historyNotes: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, lineHeight: 19 },
    historyEmpty: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, fontStyle: 'italic' },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 10,
      paddingHorizontal: 32,
    },
    emptyText: { fontFamily: F.uiSemi, fontSize: 15, color: T.textDim },
    emptySub: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, textAlign: 'center' },
    errorText: { fontFamily: F.uiMed, fontSize: 15, color: T.danger, textAlign: 'center' },
    proGateCentered: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 32, gap: 12,
    },
    proGateCircle: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: withAlpha(T.gold, 0.15),
      borderWidth: 1, borderColor: withAlpha(T.gold, 0.3),
      alignItems: 'center', justifyContent: 'center',
    },
    proGateTitle: { fontFamily: F.uiBold, fontSize: 20, color: T.text, letterSpacing: -0.3 },
    proGateSub: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim, textAlign: 'center', lineHeight: 21 },
    proGateBtn: {
      marginTop: 8, backgroundColor: T.primary, borderRadius: R.card,
      paddingVertical: 13, paddingHorizontal: 28,
    },
    proGateBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },

    compHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingRight: D.pad,
    },
    logBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6 },
    logBtnText: { fontFamily: F.uiSemi, fontSize: 13, color: T.primary },
    compEmpty: { fontFamily: F.uiMed, fontSize: 13, color: T.muted, paddingHorizontal: D.pad, paddingBottom: 4 },
    rankCard: {
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 14, paddingVertical: 12, gap: 6,
    },
    rankCurrent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rankName: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    stripeRow: { flexDirection: 'row', gap: 3 },
    stripe: { width: 4, height: 16, borderRadius: 1, backgroundColor: T.gold },
    rankHistory: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    fightRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.sm,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    fightBadge: {
      width: 32, height: 32, borderRadius: 16, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    fightBadgeText: { fontFamily: F.monoBold, fontSize: 14 },
    fightOpp: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    fightMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, marginTop: 2 },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%',
      backgroundColor: T.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
      paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28,
    },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.borderStrong, marginBottom: 12 },
    sheetTitle: { fontFamily: F.uiBold, fontSize: 19, color: T.text, marginBottom: 14 },
    sheetLabel: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
    sheetInput: {
      fontFamily: F.uiMed, fontSize: 15, color: T.text,
      backgroundColor: T.surface2, borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
      paddingHorizontal: 12, paddingVertical: 11,
    },
    sheetTextarea: { minHeight: 64, fontFamily: F.ui },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 8,
      borderRadius: R.chip, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface2,
    },
    chipActive: { backgroundColor: T.primary, borderColor: T.primary },
    chipText: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim },
    chipTextActive: { color: T.onPrimary },
    saveBtn: {
      marginTop: 22, backgroundColor: T.primary, borderRadius: R.card,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },
  });
}
