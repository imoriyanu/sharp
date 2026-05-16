import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS, setPremiumStatus } from '../../src/services/premium';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatConfigured } from '../../src/services/revenuecat';
import { getContext } from '../../src/services/storage';
import { trackEvent, Events } from '../../src/services/analytics';

// Tight 3-line summary of what Pro unlocks. Mirrors the onboarding paywall
// so the in-app upsell reads the same as the first impression.
const BENEFITS = [
  'Coaching on every session',
  'Daily practice, no weekly cap',
  'Briefings tailored to your role',
];

export default function PremiumScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [packages, setPackages] = useState<{ monthly?: any; annual?: any }>({});
  const rcEnabled = isRevenueCatConfigured();

  useEffect(() => {
    trackEvent(Events.PAYWALL_VIEWED);
    loadOfferings();
  }, []);

  async function loadOfferings() {
    if (!rcEnabled) return;
    try {
      const offering = await getOfferings();
      if (offering) {
        const pkgs: typeof packages = {};
        for (const pkg of offering.availablePackages) {
          if (pkg.packageType === 'MONTHLY') pkgs.monthly = pkg;
          else if (pkg.packageType === 'ANNUAL') pkgs.annual = pkg;
        }
        setPackages(pkgs);
      }
    } catch (e) {
      __DEV__ && console.warn('Failed to load offerings:', e);
    }
  }

  const annualPlan = PLANS.find(p => p.id === 'annual') || PLANS[0];
  const monthlyPlan = PLANS.find(p => p.id === 'monthly') || PLANS[1] || PLANS[0];

  // Live prices. Fall back to static when RC has not loaded yet.
  const annualPrice = packages.annual ? packages.annual.product.priceString : annualPlan.price;
  const annualPerMonth = packages.annual ? `${packages.annual.product.currencyCode} ${(packages.annual.product.price / 12).toFixed(2)}/mo` : annualPlan.perMonth;
  const monthlyPrice = packages.monthly ? `${packages.monthly.product.priceString}/mo` : monthlyPlan.perMonth;

  // Live annual savings derived from the user's actual RC-localized prices so
  // the chip currency matches the price currency (avoids "Save £90" next to a
  // USD price). Hidden until both packages have loaded.
  let annualSavings: string | null = null;
  if (packages.annual && packages.monthly) {
    const saved = (packages.monthly.product.price * 12) - packages.annual.product.price;
    if (saved > 0) {
      try {
        const formatted = new Intl.NumberFormat('en', {
          style: 'currency',
          currency: packages.annual.product.currencyCode,
          maximumFractionDigits: 0,
        }).format(saved);
        annualSavings = `Save ${formatted}`;
      } catch {
        annualSavings = null;
      }
    }
  }

  async function handlePurchase() {
    const pkg = selected === 'monthly' ? packages.monthly : packages.annual;

    if (!rcEnabled || !pkg) {
      if (__DEV__) {
        setPurchasing(true);
        try {
          await setPremiumStatus(selected, new Date(Date.now() + 31 * 86400000).toISOString());
          navigateAfterPurchase();
        } catch { setPurchasing(false); }
      } else {
        Alert.alert('Not available', 'Purchases are not available right now. Please try again later.');
      }
      return;
    }

    setPurchasing(true);
    try {
      const { success } = await purchasePackage(pkg);
      if (success) {
        await setPremiumStatus(selected);
        trackEvent(Events.PURCHASE_COMPLETED || Events.PAYWALL_VIEWED, { plan: selected, price: pkg.product?.priceString });
        navigateAfterPurchase();
      } else {
        setPurchasing(false);
      }
    } catch (e: any) {
      setPurchasing(false);
      Alert.alert('Purchase failed', e?.message || 'Something went wrong. Please try again.');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const planId = await restorePurchases();
      if (planId) {
        await setPremiumStatus(planId);
        Alert.alert('Restored', 'Your Sharp Pro subscription has been restored.', [
          { text: 'OK', onPress: () => navigateAfterPurchase() },
        ]);
      } else {
        Alert.alert('No subscription found', 'We couldn\'t find an active subscription for this Apple ID.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message || 'Something went wrong.');
    } finally {
      setRestoring(false);
    }
  }

  async function navigateAfterPurchase() {
    const ctx = await getContext();
    const hasContext = !!(ctx?.roleText || ctx?.currentCompany || ctx?.situationText || ctx?.dreamRoleAndCompany);
    if (!hasContext) {
      router.replace('/context/setup');
    } else {
      router.back();
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <Text style={s.close}>×</Text>
        </TouchableOpacity>

        <FadeIn>
          <View style={s.hero}>
            <Image source={require('../../assets/icon.png')} style={s.mascot} />
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroSub}>Get sharper, faster.</Text>
            <View style={s.trialPill}>
              <Text style={s.trialPillText}>7 DAYS FREE · CANCEL ANYTIME</Text>
            </View>
          </View>
        </FadeIn>

        {/* What Pro unlocks. Three benefit lines, not a feature matrix. */}
        <FadeIn delay={200}>
          <View style={s.benefitsBlock}>
            {BENEFITS.map((b, i) => (
              <View key={i} style={s.benefitRow}>
                <Text style={s.benefitTick}>✓</Text>
                <Text style={s.benefitText}>{b}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Annual plan */}
        <FadeIn delay={400}>
          <TouchableOpacity style={[s.planCard, selected === 'annual' && s.planRecommended]} onPress={() => setSelected('annual')} activeOpacity={0.7} disabled={purchasing}>
            {!!annualPlan.badge && <View style={s.recBadge}><Text style={s.recBadgeText}>{annualPlan.badge}</Text></View>}
            <View style={s.planTop}>
              <Text style={s.planName}>{annualPlan.name}</Text>
              {!!annualSavings && <Text style={s.planSavings}>{annualSavings}</Text>}
            </View>
            <Text style={s.planPrice}>{annualPrice}/yr</Text>
            <Text style={s.planPerMonth}>{annualPerMonth} equivalent · billed yearly after trial</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* Monthly plan */}
        <FadeIn delay={500}>
          <TouchableOpacity style={[s.planCard, selected === 'monthly' && s.planRecommended]} onPress={() => setSelected('monthly')} activeOpacity={0.7} disabled={purchasing}>
            <Text style={s.planName}>{monthlyPlan.name}</Text>
            <Text style={s.planPrice}>{monthlyPrice}</Text>
            <Text style={s.planPerMonth}>billed monthly after trial</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* CTA. Trial-first */}
        <FadeIn delay={600}>
          <TouchableOpacity style={[s.trialBtn, purchasing && { opacity: 0.6 }]} onPress={handlePurchase} activeOpacity={0.8} disabled={purchasing}>
            {purchasing
              ? <ActivityIndicator color={colors.text.inverse} />
              : (
                <View>
                  <Text style={s.trialText}>Start 7-Day Free Trial</Text>
                  <Text style={s.trialSub}>
                    Then {selected === 'annual' ? `${annualPrice}/yr` : monthlyPrice} · Cancel anytime
                  </Text>
                </View>
              )
            }
          </TouchableOpacity>
        </FadeIn>

        <TouchableOpacity onPress={handleRestore} disabled={purchasing || restoring}>
          {restoring
            ? <ActivityIndicator size="small" color={colors.accent.primary} style={{ paddingVertical: spacing.md }} />
            : <Text style={s.restoreText}>Restore purchases</Text>
          }
        </TouchableOpacity>

        <View style={s.legalLinksRow}>
          <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={6}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={s.legalDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} hitSlop={6}>
            <Text style={s.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.legal}>Free for 7 days, then your selected plan auto-renews unless cancelled at least 24 hours before the trial ends. Manage anytime in Settings. Payment charged to your Apple ID at the end of the trial.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40) },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.sm },
  close: { fontSize: fp(22), color: colors.text.muted },

  hero: { alignItems: 'center', marginBottom: spacing.xl },
  mascot: { width: wp(72), height: wp(72), borderRadius: wp(20), marginBottom: spacing.md },
  heroTitle: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary },
  heroSub: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: wp(3) },
  trialPill: { backgroundColor: colors.feedback.positiveBg, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5), marginTop: spacing.md, borderWidth: 1, borderColor: colors.success },
  trialPillText: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.success, letterSpacing: 1.2 },

  // Benefits (replaces 8-card feature list)
  benefitsBlock: { marginBottom: spacing.xxl, paddingHorizontal: spacing.sm, gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitTick: { fontSize: fp(16), fontWeight: typography.weight.black, color: colors.success, width: wp(20), textAlign: 'center' },
  benefitText: { flex: 1, fontSize: typography.size.base, fontWeight: typography.weight.semibold, color: colors.text.primary },

  // Plans
  planCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.sm },
  planRecommended: { borderColor: colors.accent.primary, borderWidth: 2, ...shadows.accent },
  recBadge: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(3) },
  recBadgeText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.inverse },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  planName: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary },
  planSavings: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success, backgroundColor: colors.feedback.positiveBg, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  planPrice: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: -0.5 },
  planPerMonth: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: wp(3) },

  trialBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(14), alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg, ...shadows.accent },
  trialText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse, textAlign: 'center' },
  trialSub: { fontSize: typography.size.xs, color: colors.text.inverse, opacity: 0.85, textAlign: 'center', marginTop: 3 },

  restoreText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary, textAlign: 'center', paddingVertical: spacing.md },

  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  legalLink: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.accent.primary, textDecorationLine: 'underline' },
  legalDot: { fontSize: fp(11), color: colors.text.muted, paddingHorizontal: spacing.xs },
  legal: { fontSize: fp(11), color: colors.text.muted, lineHeight: fp(16), textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
});
