import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS, setPremiumStatus } from '../../src/services/premium';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatConfigured } from '../../src/services/revenuecat';

const COMPARE = [
  { feature: 'Daily Challenge', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Sharp Duels', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'One Shot sessions', free: '—', pro: '5/day' },
  { feature: 'Threaded practice', free: '—', pro: '5/day' },
  { feature: 'Industry questions', free: '—', pro: '5/day' },
  { feature: 'Context & documents', free: '—', pro: '✓' },
  { feature: 'Model answers', free: '—', pro: '✓' },
];

export default function OnboardingPaywall() {
  const router = useRouter();
  const [selected, setSelected] = useState<'annual' | 'monthly'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [packages, setPackages] = useState<{ monthly?: any; annual?: any }>({});
  const rcEnabled = isRevenueCatConfigured();

  useEffect(() => {
    if (rcEnabled) {
      getOfferings().then(offering => {
        if (!offering) return;
        const pkgs: typeof packages = {};
        for (const pkg of offering.availablePackages) {
          if (pkg.packageType === 'MONTHLY') pkgs.monthly = pkg;
          else if (pkg.packageType === 'ANNUAL') pkgs.annual = pkg;
        }
        setPackages(pkgs);
      });
    }
  }, []);

  const annualPlan = PLANS.find(p => p.id === 'annual') || PLANS[0];
  const monthlyPlan = PLANS.find(p => p.id === 'monthly') || PLANS[1] || PLANS[0];

  // Use real prices when available
  const annualPrice = packages.annual ? packages.annual.product.priceString : annualPlan.price;
  const annualPerMonth = packages.annual ? `${packages.annual.product.currencyCode} ${(packages.annual.product.price / 12).toFixed(2)}/mo` : annualPlan.perMonth;
  const monthlyPrice = packages.monthly ? `${packages.monthly.product.priceString}/mo` : monthlyPlan.perMonth;

  async function handlePurchase() {
    const planId = selected;
    const pkg = planId === 'monthly' ? packages.monthly : packages.annual;

    if (!rcEnabled || !pkg) {
      // Dev/testing fallback
      setPurchasing(true);
      const expiresAt = planId === 'monthly'
        ? new Date(Date.now() + 31 * 86400000).toISOString()
        : new Date(Date.now() + 365 * 86400000).toISOString();
      await setPremiumStatus(planId, expiresAt);
      router.replace('/onboarding/welcome');
      return;
    }

    setPurchasing(true);
    try {
      const { success } = await purchasePackage(pkg);
      if (success) {
        await setPremiumStatus(planId);
        router.replace('/onboarding/welcome');
      } else {
        setPurchasing(false);
      }
    } catch (e: any) {
      setPurchasing(false);
      Alert.alert('Purchase failed', e?.message || 'Something went wrong. Please try again.');
    }
  }

  async function handleRestore() {
    const planId = await restorePurchases();
    if (planId) {
      await setPremiumStatus(planId);
      Alert.alert('Restored', 'Your subscription has been restored.', [
        { text: 'OK', onPress: () => router.replace('/onboarding/welcome') },
      ]);
    } else {
      Alert.alert('No subscription found', 'We couldn\'t find an active subscription for this Apple ID.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => !purchasing && router.replace('/onboarding/welcome')} style={s.closeBtn}>
          <Text style={s.close}>×</Text>
        </TouchableOpacity>

        <FadeIn>
          <View style={s.hero}>
            <Text style={s.heroEmoji}>👑</Text>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroSub}>Get sharper, faster.</Text>
          </View>
        </FadeIn>

        {/* Comparison table */}
        <FadeIn delay={200}>
          <View style={s.compareCard}>
            <View style={s.compareHeader}>
              <Text style={s.compareLabel}>Feature</Text>
              <Text style={s.compareFree}>Free</Text>
              <Text style={s.comparePro}>Pro</Text>
            </View>
            {COMPARE.map((row, i) => (
              <View key={i} style={[s.compareRow, i < COMPARE.length - 1 && s.compareBorder]}>
                <Text style={s.compareFeature}>{row.feature}</Text>
                <Text style={s.compareFreeVal}>{row.free}</Text>
                <Text style={s.compareProVal}>{row.pro}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Annual plan */}
        <FadeIn delay={400}>
          <TouchableOpacity style={[s.planCard, selected === 'annual' && s.planRecommended]} onPress={() => setSelected('annual')} activeOpacity={0.7} disabled={purchasing}>
            <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
            <View style={s.planTop}>
              <Text style={s.planName}>{annualPlan.name}</Text>
              <Text style={s.planSavings}>{annualPlan.savings}</Text>
            </View>
            <Text style={s.planPrice}>{annualPerMonth}</Text>
            <Text style={s.planBilled}>{annualPrice} billed yearly</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* Monthly plan */}
        <FadeIn delay={500}>
          <TouchableOpacity style={[s.planCard, selected === 'monthly' && s.planRecommended]} onPress={() => setSelected('monthly')} activeOpacity={0.7} disabled={purchasing}>
            <Text style={s.planName}>{monthlyPlan.name}</Text>
            <Text style={s.planPrice}>{monthlyPrice}</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={600}>
          <TouchableOpacity style={[s.trialBtn, purchasing && { opacity: 0.6 }]} onPress={handlePurchase} activeOpacity={0.8} disabled={purchasing}>
            {purchasing ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={s.trialText}>Get {selected === 'annual' ? 'Annual' : 'Monthly'}</Text>}
          </TouchableOpacity>
        </FadeIn>

        <TouchableOpacity onPress={handleRestore} disabled={purchasing}>
          <Text style={s.restoreText}>Restore purchases</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => !purchasing && router.replace('/onboarding/welcome')} disabled={purchasing}>
          <Text style={s.skipText}>Maybe later</Text>
        </TouchableOpacity>

        <Text style={s.legal}>Payment will be charged to your Apple ID account at confirmation. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40) },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.sm },
  close: { fontSize: fp(22), color: colors.text.muted },

  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  heroEmoji: { fontSize: fp(40), marginBottom: spacing.sm },
  heroTitle: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary },
  heroSub: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: wp(3) },

  // Comparison
  compareCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.xxl, ...shadows.md },
  compareHeader: { flexDirection: 'row', padding: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.bg.tertiary },
  compareLabel: { flex: 2, fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted },
  compareFree: { flex: 1, fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textAlign: 'center' },
  comparePro: { flex: 1, fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary, textAlign: 'center' },
  compareRow: { flexDirection: 'row', padding: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' },
  compareBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  compareFeature: { flex: 2, fontSize: typography.size.xs, color: colors.text.primary, fontWeight: typography.weight.semibold },
  compareFreeVal: { flex: 1, fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center' },
  compareProVal: { flex: 1, fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.bold, textAlign: 'center' },

  // Plans
  planCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.sm },
  planRecommended: { borderColor: colors.accent.primary, borderWidth: 2, ...shadows.accent },
  recBadge: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(3) },
  recBadgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.inverse },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  planName: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary },
  planSavings: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success, backgroundColor: colors.feedback.positiveBg, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  planPrice: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.accent.primary },
  planBilled: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: wp(2) },

  trialBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg, ...shadows.accent },
  trialText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  restoreText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary, textAlign: 'center', paddingVertical: spacing.md },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.md },

  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
});
