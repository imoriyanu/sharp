import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS, setPremiumStatus, isPremium } from '../../src/services/premium';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatConfigured } from '../../src/services/revenuecat';
import { getContext } from '../../src/services/storage';
import { trackEvent, Events } from '../../src/services/analytics';
import type { PlanId } from '../../src/types';

const FEATURES = [
  { icon: '⚡', title: '5 One Shots per day', desc: 'Full 90-second coaching sessions' },
  { icon: '⚓', title: '5 Threaded Challenges per day', desc: '4-round escalating pressure drills' },
  { icon: '📰', title: '5 Industry Questions per day', desc: 'Real news tailored to your role' },
  { icon: '🎧', title: 'Model answers', desc: 'Listen to how an expert would answer' },
  { icon: '📄', title: 'Context & documents', desc: 'Upload your CV for personalised questions' },
  { icon: '📊', title: 'Sharp Summary', desc: 'AI progress review with coaching focus' },
  { icon: '🔄', title: 'Practice again', desc: 'Re-record and compare your improvement' },
  { icon: '❄️', title: 'Streak freeze', desc: '1 free freeze per week to protect your streak' },
];

export default function PremiumScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [packages, setPackages] = useState<{ monthly?: any; annual?: any }>({});
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const rcEnabled = isRevenueCatConfigured();

  useEffect(() => {
    trackEvent(Events.PAYWALL_VIEWED);
    loadOfferings();
  }, []);

  async function loadOfferings() {
    if (!rcEnabled) { setLoadingOfferings(false); return; }
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
    } finally {
      setLoadingOfferings(false);
    }
  }

  // Build display plans — use real prices from RevenueCat when available, fall back to hardcoded
  const displayPlans = PLANS.map(plan => {
    const pkg = plan.id === 'monthly' ? packages.monthly : packages.annual;
    if (pkg) {
      const priceStr = pkg.product.priceString;
      const monthlyPrice = plan.id === 'annual' && pkg.product.price
        ? `${pkg.product.currencyCode} ${(pkg.product.price / 12).toFixed(2)}/mo`
        : `${priceStr}/mo`;
      return { ...plan, price: priceStr, perMonth: plan.id === 'annual' ? monthlyPrice : `${priceStr}/mo` };
    }
    return plan;
  });

  const selectedPlan = displayPlans.find(p => p.id === selected) || displayPlans[0];

  async function handlePurchase() {
    const pkg = selected === 'monthly' ? packages.monthly : packages.annual;

    // If RevenueCat not configured or no package, fall back to direct set (dev/testing)
    if (!rcEnabled || !pkg) {
      setPurchasing(true);
      try {
        const expiresAt = selected === 'monthly'
          ? new Date(Date.now() + 31 * 86400000).toISOString()
          : new Date(Date.now() + 365 * 86400000).toISOString();
        await setPremiumStatus(selected, expiresAt);
        navigateAfterPurchase();
      } catch { setPurchasing(false); }
      return;
    }

    // Real purchase via RevenueCat
    setPurchasing(true);
    try {
      const { success } = await purchasePackage(pkg);
      if (success) {
        await setPremiumStatus(selected);
        trackEvent(Events.PAYWALL_VIEWED, { purchased: true, plan: selected });
        navigateAfterPurchase();
      } else {
        // User cancelled — not an error
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

        {/* Hero */}
        <FadeIn>
          <View style={s.hero}>
            <View style={s.mascotWrap}>
              <Image source={require('../../assets/icon.png')} style={s.mascot} />
              <View style={s.speechBubble}>
                <Text style={s.speechText}>Ready to get sharper?</Text>
                <View style={s.speechTail} />
              </View>
            </View>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroHeadline}>
              Your personal AI communication{'\n'}coach — unlimited practice
            </Text>
          </View>
        </FadeIn>

        {/* Anchor */}
        <FadeIn delay={100}>
          <View style={s.anchorCard}>
            <Text style={s.anchorIcon}>💡</Text>
            <Text style={s.anchorText}>A single session with a communication coach costs £150–500. Sharp Pro gives you unlimited AI coaching for less than the price of lunch.</Text>
          </View>
        </FadeIn>

        {/* Features */}
        <FadeIn delay={150}>
          <Text style={s.sectionLabel}>Everything in Pro</Text>
          <View style={s.featureList}>
            {FEATURES.map(f => (
              <View key={f.title} style={s.featureRow}>
                <Text style={s.featureIcon}>{f.icon}</Text>
                <View style={s.featureInfo}>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Plans */}
        <FadeIn delay={200}>
          <Text style={s.sectionLabel}>Choose your plan</Text>
          <View style={s.planGroup}>
            {displayPlans.map((plan) => {
              const active = selected === plan.id;
              return (
                <TouchableOpacity key={plan.id} style={[s.planCard, active && s.planActive]} onPress={() => plan.id !== 'free' && setSelected(plan.id as 'monthly' | 'annual')} activeOpacity={0.7}>
                  <View style={[s.radio, active && s.radioOn]}>{active && <View style={s.radioDot} />}</View>
                  <View style={s.planInfo}>
                    <Text style={[s.planName, active && s.planNameActive]}>{plan.name}</Text>
                    <Text style={s.planPrice}>{plan.perMonth}</Text>
                    {plan.period === '/year' && <Text style={s.planBilled}>{plan.price}/year</Text>}
                  </View>
                  {plan.savings && <View style={s.savingsBadge}><Text style={s.savingsText}>{plan.savings}</Text></View>}
                  {plan.badge && <View style={[s.badge, plan.recommended ? s.badgeAccent : s.badgeGhost]}><Text style={[s.badgeText, plan.recommended && s.badgeTextAccent]}>{plan.badge}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* Free comparison */}
        <FadeIn delay={250}>
          <View style={s.freeCompare}>
            <Text style={s.freeTitle}>Free plan includes</Text>
            <Text style={s.freeItem}>Unlimited Daily 30</Text>
            <Text style={s.freeItem}>Unlimited Sharp Duels</Text>
          </View>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={300}>
          <TouchableOpacity style={[s.ctaBtn, purchasing && s.ctaBtnDisabled]} onPress={handlePurchase} activeOpacity={0.8} disabled={purchasing}>
            <Text style={s.ctaText}>{purchasing ? 'Processing...' : `Get ${selectedPlan.name}`}</Text>
            <Text style={s.ctaSub}>{selectedPlan.perMonth}{selectedPlan.period === '/year' ? ' · billed annually' : ' · cancel anytime'}</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* Restore */}
        <FadeIn delay={350}>
          <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} activeOpacity={0.7} disabled={restoring || purchasing}>
            {restoring ? <ActivityIndicator size="small" color={colors.accent.primary} /> : <Text style={s.restoreText}>Restore purchases</Text>}
          </TouchableOpacity>
        </FadeIn>

        {/* Bottom */}
        <FadeIn delay={400}>
          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.
          </Text>
        </FadeIn>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.sm },
  close: { fontSize: fp(22), color: colors.text.muted },

  // Hero
  hero: { alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.sm },
  mascotWrap: { alignItems: 'center', marginBottom: spacing.md },
  mascot: { width: wp(100), height: wp(100), borderRadius: wp(28), marginBottom: spacing.sm },
  speechBubble: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadows.md, position: 'relative' },
  speechText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  speechTail: { position: 'absolute', top: -wp(6), left: '50%' as any, marginLeft: -wp(6), width: 0, height: 0, borderLeftWidth: wp(6), borderRightWidth: wp(6), borderBottomWidth: wp(6), borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.bg.secondary },
  heroTitle: { fontSize: fp(34), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -1, marginTop: spacing.md },
  heroHeadline: { fontSize: typography.size.base, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(22), marginTop: spacing.sm },

  // Anchor
  anchorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.accent.light, borderWidth: 1.5, borderColor: colors.accent.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl },
  anchorIcon: { fontSize: fp(18), marginTop: wp(2) },
  anchorText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.dark, flex: 1, lineHeight: fp(20) },

  // Section
  sectionLabel: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md, marginTop: spacing.md },

  // Features
  featureList: { gap: spacing.sm, marginBottom: spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  featureIcon: { fontSize: fp(18), width: wp(32), textAlign: 'center' },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  featureDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: wp(1) },

  // Plan cards
  planGroup: { gap: spacing.sm, marginBottom: spacing.lg },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderLight },
  planActive: { borderColor: colors.accent.primary, backgroundColor: colors.accent.light },
  radio: { width: wp(20), height: wp(20), borderRadius: wp(10), borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  radioOn: { borderColor: colors.accent.primary },
  radioDot: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: colors.accent.primary },
  planInfo: { flex: 1 },
  planName: { fontSize: typography.size.sm, fontWeight: typography.weight.black, color: colors.text.primary },
  planNameActive: { color: colors.accent.primary },
  planPrice: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.primary, marginTop: wp(2) },
  planBilled: { fontSize: fp(9), color: colors.text.muted, marginTop: wp(1) },
  savingsBadge: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  savingsText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 0.5 },
  badge: { position: 'absolute', top: -wp(10), right: wp(16), borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  badgeAccent: { backgroundColor: colors.accent.primary },
  badgeGhost: { backgroundColor: colors.bg.tertiary, borderWidth: 1, borderColor: colors.border },
  badgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.tertiary },
  badgeTextAccent: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Free comparison
  freeCompare: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.borderLight },
  freeTitle: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  freeItem: { fontSize: typography.size.sm, color: colors.text.tertiary, paddingVertical: wp(4), borderBottomWidth: 1, borderBottomColor: colors.borderLight },

  // CTA
  ctaBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.xl, paddingVertical: wp(18), alignItems: 'center', marginBottom: spacing.lg, ...shadows.accent },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: fp(16), fontWeight: typography.weight.black, color: colors.text.inverse },
  ctaSub: { fontSize: fp(10), color: 'rgba(255,255,255,0.8)', marginTop: wp(3) },

  // Bottom
  restoreBtn: { alignItems: 'center', padding: spacing.lg },
  restoreText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold },
  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', paddingHorizontal: spacing.lg },
  bottomSpacer: { height: wp(40) },
});
