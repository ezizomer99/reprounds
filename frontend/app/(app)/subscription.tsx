import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useCurrentUser } from '../../src/hooks/useAuth';
import { F, R, D, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { withAlpha } from '../../src/lib/color';

const PLAY_STORE_SUBS_URL =
  'https://play.google.com/store/account/subscriptions?package=com.reprounds.app';

const PRODUCT_NAMES: Record<string, string> = {
  reprounds_pro_monthly: 'Pro Monthly',
  reprounds_pro_annual: 'Pro Annual',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export default function SubscriptionScreen() {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro: isRcPro, isLoading: subLoading, customerInfo, restorePurchases } = useSubscription();
  const { data: user } = useCurrentUser();
  const [restoring, setRestoring] = useState(false);

  const isComped = user?.isComped ?? false;
  const proEntitlement = customerInfo?.entitlements.active['pro'];
  const planId = proEntitlement?.productIdentifier ?? null;
  const planLabel = planId ? (PRODUCT_NAMES[planId] ?? planId) : null;
  const periodType = proEntitlement?.periodType ?? null;
  const isTrial = periodType === 'TRIAL';
  const willRenew = proEntitlement?.willRenew ?? false;
  const expirationDate = proEntitlement?.expirationDate ?? null;

  // Purchase history: merge allPurchaseDates + allExpirationDates, sort newest-first
  const purchaseHistory = useMemo(() => {
    if (!customerInfo?.allPurchaseDates) return [];
    return Object.entries(customerInfo.allPurchaseDates)
      .map(([productId, purchasedAt]) => ({
        productId,
        purchasedAt,
        expiresAt: customerInfo.allExpirationDates?.[productId] ?? null,
      }))
      .sort((a, b) => {
        if (!a.purchasedAt) return 1;
        if (!b.purchasedAt) return -1;
        return new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime();
      });
  }, [customerInfo]);

  async function handleRestore() {
    setRestoring(true);
    try {
      await restorePurchases();
      Alert.alert('Purchases restored', 'Your subscription has been restored.');
    } catch {
      Alert.alert('Restore failed', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  function handleManage() {
    Linking.openURL(PLAY_STORE_SUBS_URL);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status card ── */}
        {subLoading && !isComped ? (
          <View style={styles.statusLoading}>
            <ActivityIndicator color={T.primary} />
          </View>
        ) : isComped ? (
          <CompedCard styles={styles} T={T} />
        ) : isRcPro ? (
          <ActiveCard
            styles={styles}
            T={T}
            planLabel={planLabel}
            isTrial={isTrial}
            willRenew={willRenew}
            expirationDate={expirationDate}
          />
        ) : (
          <FreeCard styles={styles} T={T} onUpgrade={() => router.push('/paywall' as never)} />
        )}

        {/* ── Actions ── */}
        <View style={styles.listCard}>
          {isRcPro && (
            <>
              <ActionRow
                icon="card-outline"
                label="Manage Subscription"
                onPress={handleManage}
                styles={styles}
                T={T}
              />
              <View style={styles.rowDivider} />
            </>
          )}
          <ActionRow
            icon="refresh-outline"
            label="Restore Purchases"
            onPress={handleRestore}
            loading={restoring}
            last
            styles={styles}
            T={T}
          />
        </View>

        {/* ── Purchase history ── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.eyebrow}>Purchase History</Text>
        </View>
        <View style={styles.listCard}>
          {purchaseHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No purchase history</Text>
            </View>
          ) : (
            purchaseHistory.map((entry, i) => (
              <View key={entry.productId + (entry.purchasedAt ?? i)}>
                <View style={styles.historyRow}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyProduct}>
                      {PRODUCT_NAMES[entry.productId] ?? entry.productId}
                    </Text>
                    <Text style={styles.historyDate}>
                      Purchased {formatDate(entry.purchasedAt)}
                    </Text>
                  </View>
                  {entry.expiresAt ? (
                    <Text style={styles.historyExpiry}>
                      Exp. {formatDate(entry.expiresAt)}
                    </Text>
                  ) : null}
                </View>
                {i < purchaseHistory.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CompedCard({ styles, T }: { styles: ReturnType<typeof makeStyles>; T: ThemeColors }) {
  return (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
        <Ionicons name="star" size={26} color={T.gold} />
      </View>
      <Text style={styles.statusTitle}>RepRounds Pro</Text>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
          <Text style={[styles.badgeText, { color: T.gold }]}>Complimentary</Text>
        </View>
      </View>
      <Text style={styles.statusSub}>You have complimentary Pro access.</Text>
    </View>
  );
}

function ActiveCard({
  styles,
  T,
  planLabel,
  isTrial,
  willRenew,
  expirationDate,
}: {
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
  planLabel: string | null;
  isTrial: boolean;
  willRenew: boolean;
  expirationDate: string | null;
}) {
  return (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: withAlpha(T.gold, 0.15) }]}>
        <Ionicons name="star" size={26} color={T.gold} />
      </View>
      <Text style={styles.statusTitle}>RepRounds Pro</Text>
      <View style={styles.badgeRow}>
        {planLabel ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(T.primary, 0.12) }]}>
            <Text style={[styles.badgeText, { color: T.primary }]}>{planLabel}</Text>
          </View>
        ) : null}
        {isTrial ? (
          <View style={[styles.badge, { backgroundColor: withAlpha('#f59e0b', 0.15) }]}>
            <Text style={[styles.badgeText, { color: '#f59e0b' }]}>Free Trial</Text>
          </View>
        ) : null}
      </View>
      {expirationDate ? (
        <Text style={styles.statusSub}>
          {willRenew ? 'Renews' : 'Expires'} {new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }).format(new Date(expirationDate))}
        </Text>
      ) : null}
    </View>
  );
}

function FreeCard({
  styles,
  T,
  onUpgrade,
}: {
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
  onUpgrade: () => void;
}) {
  return (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: T.surface2 }]}>
        <Ionicons name="lock-closed-outline" size={26} color={T.textDim} />
      </View>
      <Text style={styles.statusTitle}>Free Plan</Text>
      <Text style={styles.statusSub}>Unlock unlimited workouts, analytics, and more.</Text>
      <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade} activeOpacity={0.8}>
        <Text style={styles.upgradeBtnText}>Upgrade to RepRounds Pro</Text>
      </TouchableOpacity>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  loading,
  styles,
  T,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
  last?: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7} disabled={loading}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={17} color={T.textDim} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={T.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={T.muted} />
      )}
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingTop: 10,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: T.text,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: F.uiSemi, fontSize: 19, color: T.text },

    scroll: { flex: 1 },
    body: { padding: D.pad, gap: D.stack },

    statusLoading: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },

    // Status card
    statusCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
      paddingVertical: 18,
      alignItems: 'center',
      gap: 10,
    },
    statusIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    statusTitle: { fontFamily: F.uiBold, fontSize: 22, color: T.text },
    statusSub: {
      fontFamily: F.uiMed,
      fontSize: 13,
      color: T.textDim,
      textAlign: 'center',
      lineHeight: 19,
    },

    // Badges
    badgeRow: { flexDirection: 'row', gap: 6 },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: R.chip,
    },
    badgeText: { fontFamily: F.uiBold, fontSize: 12 },

    // Upgrade button (free card)
    upgradeBtn: {
      backgroundColor: T.primary,
      borderRadius: R.sm,
      paddingVertical: 12,
      paddingHorizontal: 24,
      marginTop: 4,
    },
    upgradeBtnText: { fontFamily: F.uiBold, fontSize: 15, color: T.onPrimary },

    // List card (actions + history)
    listCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
    },
    rowDivider: {
      height: 1,
      backgroundColor: T.border,
      marginLeft: 30 + 12,
    },

    // Action rows
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 15,
    },
    actionIcon: {
      width: 30,
      height: 30,
      borderRadius: R.sm,
      backgroundColor: T.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: { flex: 1, fontFamily: F.uiMed, fontSize: 15, color: T.text },

    // Section label
    sectionLabel: { marginBottom: -4 },
    eyebrow: {
      fontFamily: F.uiBold,
      fontSize: 11,
      color: T.textDim,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },

    // History rows
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: D.cardPad,
      paddingVertical: 14,
      gap: 12,
    },
    historyLeft: { flex: 1, gap: 3 },
    historyProduct: { fontFamily: F.uiSemi, fontSize: 14, color: T.text },
    historyDate: { fontFamily: F.uiMed, fontSize: 12, color: T.textDim },
    historyExpiry: { fontFamily: F.uiMed, fontSize: 12, color: T.muted },

    // Empty history
    emptyHistory: { paddingVertical: 20, alignItems: 'center' },
    emptyHistoryText: { fontFamily: F.uiMed, fontSize: 14, color: T.muted },
  });
}
