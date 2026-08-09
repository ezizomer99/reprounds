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
import { useSubscription } from '../../src/context/SubscriptionContext';
import { F, R, D, ThemeColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { withAlpha } from '../../src/lib/color';
import { InlineError } from '../../src/components/InlineError';

const PRO_FEATURES = [
  { icon: 'infinite-outline' as const, text: 'Unlimited custom exercises & disciplines' },
  { icon: 'list-outline' as const, text: 'Unlimited routines' },
  { icon: 'time-outline' as const, text: 'Full session history (all time)' },
  { icon: 'trophy-outline' as const, text: 'PR tracking & estimated 1RM' },
  // Not "& streaks" any more — the week streak is free on both the Workout and
  // Stats tabs, and selling something the user already has is how a paywall
  // stops being believed.
  { icon: 'trending-up-outline' as const, text: 'Advanced analytics & top lifts' },
  { icon: 'options-outline' as const, text: 'Custom discipline fields' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const { purchasePro, restorePurchases, prices, pricesUnavailable, refreshPrices } =
    useSubscription();
  const [loading, setLoading] = useState<'monthly' | 'annual' | 'restore' | null>(null);

  async function handlePurchase(plan: 'reprounds_pro_monthly' | 'reprounds_pro_annual') {
    const key = plan === 'reprounds_pro_monthly' ? 'monthly' : 'annual';
    setLoading(key);
    try {
      await purchasePro(plan);
      router.back();
    } catch (err: unknown) {
      // The SDK sets `userCancelled` on the error. This used to substring-match
      // the message for "cancel", which is localized — so in any language but
      // English, backing out of the store sheet raised a "Purchase failed"
      // alert for something the user did on purpose.
      if ((err as { userCancelled?: boolean })?.userCancelled) return;
      const msg = err instanceof Error ? err.message : 'Purchase failed.';
      Alert.alert('Purchase failed', msg);
    } finally {
      setLoading(null);
    }
  }

  async function handleRestore() {
    setLoading('restore');
    try {
      // Resolves whether or not anything was found, so the result has to be
      // read rather than assumed.
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert('Restored', 'Your RepRounds Pro subscription is active again.');
        router.back();
        return;
      }
      Alert.alert(
        'Nothing to restore',
        'No previous RepRounds Pro purchase was found for this store account.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Restore failed.';
      Alert.alert('Restore failed', msg);
    } finally {
      setLoading(null);
    }
  }

  // Prices come from the store, so a failed offerings fetch left both buttons
  // reading "Loading price…" forever — and still tappable, so tapping raised a
  // bare "No offerings available." Show the failure and offer a retry instead.
  const priceLabel = (value: string | null, suffix: string) => {
    if (value) return `${value} / ${suffix}`;
    return pricesUnavailable ? 'Price unavailable' : 'Loading price…';
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={T.textDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.crownCircle}>
            <Ionicons name="trophy" size={32} color={T.gold} />
          </View>
          <Text style={styles.heroTitle}>RepRounds Pro</Text>
          <Text style={styles.heroSub}>
            The full toolkit for serious athletes — unlimited tracking, advanced
            analytics, and complete training history.
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.featureCard}>
          {PRO_FEATURES.map(({ icon, text }, i) => (
            <View key={i} style={[styles.featureRow, i < PRO_FEATURES.length - 1 && styles.featureRowBorder]}>
              <View style={styles.featureIcon}>
                <Ionicons name={icon} size={18} color={T.gold} />
              </View>
              <Text style={styles.featureText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Both plan buttons are disabled without prices, so the only way
            forward is a retry. */}
        {pricesUnavailable && (
          <InlineError
            message="Couldn't load subscription prices from the store."
            onRetry={() => { void refreshPrices(); }}
          />
        )}

        {/* Plans */}
        <TouchableOpacity
          style={[
            styles.planBtn,
            styles.planBtnAnnual,
            (loading || pricesUnavailable) && styles.planBtnDisabled,
          ]}
          onPress={() => handlePurchase('reprounds_pro_annual')}
          activeOpacity={0.8}
          disabled={!!loading || pricesUnavailable}
        >
          <View style={styles.planBtnBadge}>
            <Text style={styles.planBtnBadgeText}>BEST VALUE</Text>
          </View>
          {loading === 'annual' ? (
            <ActivityIndicator color={T.onPrimary} />
          ) : (
            <>
              <Text style={[styles.planBtnTitle, { color: T.onPrimary }]}>Annual Plan</Text>
              <Text style={[styles.planBtnPrice, { color: T.onPrimary }]}>
                {priceLabel(prices.annual, 'year')}
              </Text>
              <Text style={[styles.planBtnSub, { color: withAlpha(T.onPrimary, 0.75) }]}>
                ~40% off monthly · 7-day free trial
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.planBtn,
            styles.planBtnMonthly,
            (loading || pricesUnavailable) && styles.planBtnDisabled,
          ]}
          onPress={() => handlePurchase('reprounds_pro_monthly')}
          activeOpacity={0.8}
          disabled={!!loading || pricesUnavailable}
        >
          {loading === 'monthly' ? (
            <ActivityIndicator color={T.primary} />
          ) : (
            <>
              <Text style={styles.planBtnTitle}>Monthly Plan</Text>
              <Text style={styles.planBtnPrice}>
                {priceLabel(prices.monthly, 'month')}
              </Text>
              <Text style={styles.planBtnSub}>7-day free trial</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={!!loading}
          activeOpacity={0.7}
        >
          {loading === 'restore' ? (
            <ActivityIndicator color={T.muted} size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Payment charged to your Google Play account. Subscription auto-renews unless cancelled
          at least 24 hours before the end of the billing period.
        </Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },

    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: D.pad,
      paddingTop: 10,
      paddingBottom: 4,
    },
    closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    body: { paddingHorizontal: D.pad, gap: D.stack },

    hero: { alignItems: 'center', paddingVertical: 20, gap: 12 },
    crownCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: withAlpha(T.gold, 0.15),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(T.gold, 0.3),
    },
    heroTitle: { fontFamily: F.uiBold, fontSize: 28, color: T.text, letterSpacing: -0.5 },
    heroSub: {
      fontFamily: F.uiMed,
      fontSize: 14,
      color: T.textDim,
      textAlign: 'center',
      lineHeight: 21,
    },

    featureCard: {
      borderTopWidth: 1,
      borderTopColor: T.borderStrong,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
    },
    featureRowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
    featureIcon: {
      width: 32,
      height: 32,
      borderRadius: R.sm,
      backgroundColor: withAlpha(T.gold, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: { flex: 1, fontFamily: F.uiMed, fontSize: 14, color: T.text },

    planBtn: {
      borderRadius: R.card,
      paddingVertical: 18,
      paddingHorizontal: D.cardPad,
      alignItems: 'center',
      gap: 4,
      position: 'relative',
      overflow: 'visible',
    },
    planBtnDisabled: { opacity: 0.6 },
    planBtnAnnual: { backgroundColor: T.primary },
    planBtnMonthly: {
      backgroundColor: T.surface,
      borderWidth: 1,
      borderColor: T.border,
    },
    planBtnBadge: {
      position: 'absolute',
      top: -10,
      right: 16,
      backgroundColor: T.gold,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: R.chip,
    },
    planBtnBadgeText: {
      fontFamily: F.uiBold,
      fontSize: 9,
      color: T.onPrimary,
      letterSpacing: 0.8,
    },
    planBtnTitle: { fontFamily: F.uiBold, fontSize: 17, color: T.text },
    planBtnPrice: { fontFamily: F.uiMed, fontSize: 14, color: T.textDim },
    planBtnSub: { fontFamily: F.uiMed, fontSize: 12, color: T.muted },

    restoreBtn: { alignItems: 'center', paddingVertical: 12 },
    restoreText: { fontFamily: F.uiMed, fontSize: 14, color: T.muted },

    legalText: {
      fontFamily: F.uiMed,
      fontSize: 11,
      color: T.muted,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
