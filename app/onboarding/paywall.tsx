import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import type { PlanId } from '../../src/types';

const BENEFITS = [
  { icon: '⚡', title: '5 sessions per day', desc: 'One Shot + Threaded challenges' },
  { icon: '🎯', title: 'Personalised coaching', desc: 'Your role, company, and goals shape every question' },
  { icon: '✨', title: 'Model answers', desc: 'Hear what a 9/10 version of YOUR answer sounds like' },
  { icon: '📊', title: 'Progress tracking', desc: 'See your scores improve over time' },
];

const COMPARE = [
  { feature: 'Daily Challenge', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'One Shot sessions', free: '1/day', pro: '5/day' },
  { feature: 'Threaded practice', free: '1/week', pro: '5/day' },
  { feature: 'Model answers', free: 'Limited', pro: 'Full' },
  { feature: 'Custom context', free: '---', pro: 'Full' },
  { feature: 'Sharp Summary', free: '---', pro: 'Full' },
];

export default function OnboardingPaywall() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('annual');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')} style={s.closeBtn}>
          <Text style={s.close}>x</Text>
        </TouchableOpacity>

        {/* Hero */}
        <FadeIn>
          <View style={s.hero}>
            <View style={s.crownWrap}>
              <Text style={s.crownEmoji}>👑</Text>
            </View>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroHeadline}>You just took your first step. Pro makes sure you never stop improving.</Text>
          </View>
        </FadeIn>

        {/* Benefits grid */}
        <FadeIn delay={200}>
          <View style={s.benefitsGrid}>
            {BENEFITS.map((b, i) => (
              <View key={i} style={s.benefitCard}>
                <Text style={s.benefitIcon}>{b.icon}</Text>
                <Text style={s.benefitTitle}>{b.title}</Text>
                <Text style={s.benefitDesc}>{b.desc}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Comparison table */}
        <FadeIn delay={300}>
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

        {/* Plans — Annual + Monthly only during onboarding */}
        <FadeIn delay={400}>
          <TouchableOpacity
            style={[s.planCard, selectedPlan === 'annual' && s.planSelected]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.7}
          >
            <View style={s.bestValueBadge}><Text style={s.bestValueText}>Best Value</Text></View>
            <View style={s.planHeader}>
              <View style={[s.radioOuter, selectedPlan === 'annual' && s.radioOuterSelected]}>
                {selectedPlan === 'annual' && <View style={s.radioInner} />}
              </View>
              <View style={s.planInfo}>
                <View style={s.planNameRow}>
                  <Text style={s.planName}>Annual</Text>
                  <View style={s.savingsPill}><Text style={s.savingsText}>50% off</Text></View>
                </View>
                <View style={s.planPriceRow}>
                  <Text style={s.planPriceStrike}>£20</Text>
                  <Text style={s.planPriceMain}>£10</Text>
                  <Text style={s.planPricePer}>/month</Text>
                </View>
                <Text style={s.planBilled}>£119.99 billed annually</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.planCard, selectedPlan === 'monthly' && s.planSelected]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.7}
          >
            <View style={s.planHeader}>
              <View style={[s.radioOuter, selectedPlan === 'monthly' && s.radioOuterSelected]}>
                {selectedPlan === 'monthly' && <View style={s.radioInner} />}
              </View>
              <View style={s.planInfo}>
                <Text style={s.planName}>Monthly</Text>
                <View style={s.planPriceRow}>
                  <Text style={s.planPriceMain}>£20</Text>
                  <Text style={s.planPricePer}>/month</Text>
                </View>
                <Text style={s.planBilled}>Cancel anytime</Text>
              </View>
            </View>
          </TouchableOpacity>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={500}>
          <TouchableOpacity style={s.ctaBtn} activeOpacity={0.8}>
            <Text style={s.ctaText}>Start 7-day free trial</Text>
            <Text style={s.ctaSub}>{selectedPlan === 'annual' ? 'Then £119.99/year (£10/mo)' : 'Then £20/month'}</Text>
          </TouchableOpacity>
        </FadeIn>

        <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')}>
          <Text style={s.skipText}>Continue with free plan</Text>
        </TouchableOpacity>

        <Text style={s.legal}>Payment will be charged to your Apple ID account at confirmation. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.</Text>

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
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  crownWrap: { width: wp(56), height: wp(56), borderRadius: wp(28), backgroundColor: colors.daily.bg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  crownEmoji: { fontSize: fp(28) },
  heroTitle: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary },
  heroHeadline: { fontSize: fp(13), color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), marginTop: spacing.sm, paddingHorizontal: spacing.lg },

  // Benefits grid
  benefitsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  benefitCard: { width: '47%', backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  benefitIcon: { fontSize: fp(20), marginBottom: spacing.sm },
  benefitTitle: { fontSize: fp(11), fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: wp(2) },
  benefitDesc: { fontSize: fp(9), color: colors.text.tertiary, lineHeight: fp(14) },

  // Comparison
  compareCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.xl, ...shadows.md },
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
  planCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 2, borderColor: colors.borderLight },
  planSelected: { borderColor: colors.accent.primary, ...shadows.accent },
  bestValueBadge: { position: 'absolute', top: -wp(10), left: wp(16), backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(3) },
  bestValueText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 0.5 },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  radioOuter: { width: wp(22), height: wp(22), borderRadius: wp(11), borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: wp(2) },
  radioOuterSelected: { borderColor: colors.accent.primary },
  radioInner: { width: wp(12), height: wp(12), borderRadius: wp(6), backgroundColor: colors.accent.primary },
  planInfo: { flex: 1 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planName: { fontSize: typography.size.base, fontWeight: typography.weight.black, color: colors.text.primary },
  savingsPill: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1, borderColor: colors.feedback.positiveBorder, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  savingsText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.success },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: wp(4) },
  planPriceStrike: { fontSize: fp(16), fontWeight: typography.weight.bold, color: colors.text.muted, textDecorationLine: 'line-through', marginRight: wp(6) },
  planPriceMain: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: -1 },
  planPricePer: { fontSize: fp(12), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginLeft: wp(2) },
  planBilled: { fontSize: fp(10), color: colors.text.muted, marginTop: wp(2) },

  // CTA
  ctaBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginTop: spacing.md, ...shadows.accent },
  ctaText: { fontSize: fp(15), fontWeight: typography.weight.black, color: colors.text.inverse },
  ctaSub: { fontSize: fp(10), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },

  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.lg },

  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', paddingHorizontal: spacing.lg },

  bottomSpacer: { height: wp(30) },
});
