import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS } from '../../src/services/premium';
import type { PlanId } from '../../src/types';

const RESULTS = [
  { label: 'Average improvement', value: '+2.1 pts', sub: 'in first month' },
  { label: 'Filler words reduced', value: '47%', sub: 'fewer after 10 sessions' },
  { label: 'Structure scores', value: '4.2 → 7.1', sub: 'most improved dimension' },
];

const FEATURES = [
  { icon: '⚡', title: '5 One Shots per day', desc: 'Full scored sessions with model answers', free: '1/day' },
  { icon: '⚓', title: '5 Threaded challenges', desc: '4-turn pressure interviews with debrief', free: '1/week' },
  { icon: '🎤', title: 'Practice Again', desc: 'Re-record your weakest snippet until it lands', free: 'Locked' },
  { icon: '🎯', title: 'Custom Context', desc: 'Your role, company, docs — coaching built around you', free: 'Locked' },
  { icon: '📊', title: 'Sharp Summary', desc: 'Hear your 30-second AI progress review', free: 'Locked' },
  { icon: '✨', title: 'Snippet Coaching', desc: 'Before/after rewrites of your weakest moments', free: 'Locked' },
  { icon: '❄️', title: 'Streak Freeze', desc: "Miss a day without losing your streak", free: 'Locked' },
];

const TESTIMONIALS = [
  { quote: "I used to dread all-hands presentations. After 3 weeks with Sharp, my VP said I was the clearest communicator in the room.", initials: 'JM', role: 'Senior PM' },
  { quote: "Sharp caught my filler word habit — I was saying 'basically' 8 times per answer. Now I catch myself before I start.", initials: 'AL', role: 'Engineering Lead' },
  { quote: "The threaded challenges are brutal in the best way. My actual interviews feel easier now.", initials: 'SK', role: 'Product Designer' },
];

export default function PremiumScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('annual');

  const annual = PLANS.find(p => p.id === 'annual')!;
  const monthly = PLANS.find(p => p.id === 'monthly')!;
  const sprint = PLANS.find(p => p.id === 'pass_30')!;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <Text style={s.close}>x</Text>
        </TouchableOpacity>

        {/* Hero */}
        <FadeIn>
          <View style={s.hero}>
            <View style={s.crownWrap}>
              <Text style={s.crownEmoji}>👑</Text>
            </View>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroHeadline}>The average Sharp user improves their score by 2+ points in their first month.</Text>
            <Text style={s.heroSub}>Pro makes that happen every day.</Text>
          </View>
        </FadeIn>

        {/* Stats strip */}
        <FadeIn delay={100}>
          <View style={s.statsRow}>
            {RESULTS.map((r, i) => (
              <View key={i} style={[s.statCard, i < RESULTS.length - 1 && s.statBorder]}>
                <Text style={s.statValue}>{r.value}</Text>
                <Text style={s.statLabel}>{r.label}</Text>
                <Text style={s.statSub}>{r.sub}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Plans */}
        <FadeIn delay={200}>
          <Text style={s.section}>Choose your plan</Text>

          {/* Annual — hero plan */}
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
                  <Text style={s.planName}>{annual.name}</Text>
                  <View style={s.savingsPill}><Text style={s.savingsText}>50% off</Text></View>
                </View>
                <View style={s.planPriceRow}>
                  <Text style={s.planPriceMain}>£10</Text>
                  <Text style={s.planPricePer}>/month</Text>
                </View>
                <Text style={s.planBilled}>£119.99 billed annually</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
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
                <Text style={s.planName}>{monthly.name}</Text>
                <View style={s.planPriceRow}>
                  <Text style={s.planPriceMain}>£20</Text>
                  <Text style={s.planPricePer}>/month</Text>
                </View>
                <Text style={s.planBilled}>Cancel anytime</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Sprint Pass */}
          <TouchableOpacity
            style={[s.planCard, selectedPlan === 'pass_30' && s.planSelected]}
            onPress={() => setSelectedPlan('pass_30')}
            activeOpacity={0.7}
          >
            <View style={s.planHeader}>
              <View style={[s.radioOuter, selectedPlan === 'pass_30' && s.radioOuterSelected]}>
                {selectedPlan === 'pass_30' && <View style={s.radioInner} />}
              </View>
              <View style={s.planInfo}>
                <View style={s.planNameRow}>
                  <Text style={s.planName}>Sprint Pass</Text>
                  <View style={s.sprintBadge}><Text style={s.sprintBadgeText}>No renewal</Text></View>
                </View>
                <View style={s.planPriceRow}>
                  <Text style={s.planPriceMain}>£30</Text>
                  <Text style={s.planPricePer}> one-time</Text>
                </View>
                <Text style={s.planBilled}>30 days of Pro. For when you have a deadline.</Text>
              </View>
            </View>
          </TouchableOpacity>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={300}>
          <TouchableOpacity style={s.ctaBtn} activeOpacity={0.8}>
            <Text style={s.ctaText}>
              {selectedPlan === 'annual' ? 'Start with Annual — £10/mo' : selectedPlan === 'monthly' ? 'Subscribe — £20/mo' : 'Get Sprint Pass — £30'}
            </Text>
          </TouchableOpacity>
          <Text style={s.ctaHint}>7-day free trial on annual plan</Text>
        </FadeIn>

        {/* What you get */}
        <FadeIn delay={350}>
          <Text style={s.section}>Everything in Pro</Text>
          <View style={s.featCard}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[s.featRow, i < FEATURES.length - 1 && s.featBorder]}>
                <View style={s.featIconWrap}><Text style={s.featIcon}>{f.icon}</Text></View>
                <View style={s.featInfo}>
                  <Text style={s.featTitle}>{f.title}</Text>
                  <Text style={s.featDesc}>{f.desc}</Text>
                </View>
                <View style={s.featComparison}>
                  <Text style={s.featProLabel}>PRO</Text>
                  <Text style={s.featFreeLabel}>Free: {f.free}</Text>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Social proof */}
        <FadeIn delay={400}>
          <Text style={s.section}>What Sharp users say</Text>
          {TESTIMONIALS.map((t, i) => (
            <View key={i} style={s.testimonialCard}>
              <Text style={s.testimonialQuote}>"{t.quote}"</Text>
              <View style={s.testimonialFooter}>
                <View style={s.testimonialAvatar}><Text style={s.testimonialInitials}>{t.initials}</Text></View>
                <Text style={s.testimonialRole}>{t.role}</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        {/* Bottom CTA */}
        <FadeIn delay={450}>
          <TouchableOpacity style={s.ctaBtn} activeOpacity={0.8}>
            <Text style={s.ctaText}>
              {selectedPlan === 'annual' ? 'Start with Annual — £10/mo' : selectedPlan === 'monthly' ? 'Subscribe — £20/mo' : 'Get Sprint Pass — £30'}
            </Text>
          </TouchableOpacity>
        </FadeIn>

        <FadeIn delay={500}>
          <TouchableOpacity style={s.restoreBtn} activeOpacity={0.7}>
            <Text style={s.restoreText}>Restore purchase</Text>
          </TouchableOpacity>

          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless it is cancelled at least 24 hours before the end of the current period. The Sprint Pass does not auto-renew.
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
  crownWrap: { width: wp(64), height: wp(64), borderRadius: wp(32), backgroundColor: colors.daily.bg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  crownEmoji: { fontSize: fp(32) },
  heroTitle: { fontSize: fp(32), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -1 },
  heroHeadline: { fontSize: fp(14), color: colors.text.secondary, textAlign: 'center', lineHeight: fp(22), marginTop: spacing.md, paddingHorizontal: spacing.md, fontWeight: typography.weight.semibold },
  heroSub: { fontSize: fp(14), color: colors.accent.primary, fontWeight: typography.weight.bold, marginTop: spacing.sm },

  // Stats
  statsRow: { flexDirection: 'row', backgroundColor: colors.bg.secondary, borderRadius: radius.xl, marginBottom: spacing.xxl, ...shadows.md },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.sm },
  statBorder: { borderRightWidth: 1, borderRightColor: colors.borderLight },
  statValue: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.success },
  statLabel: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: wp(3), textAlign: 'center' },
  statSub: { fontSize: fp(8), color: colors.text.muted, marginTop: wp(1), textAlign: 'center' },

  // Section
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md, marginTop: spacing.lg },

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
  sprintBadge: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  sprintBadgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.tertiary },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: wp(4) },
  planPriceMain: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: -1 },
  planPricePer: { fontSize: fp(12), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginLeft: wp(2) },
  planBilled: { fontSize: fp(10), color: colors.text.muted, marginTop: wp(2) },

  // CTA
  ctaBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginTop: spacing.md, ...shadows.accent },
  ctaText: { fontSize: fp(14), fontWeight: typography.weight.black, color: colors.text.inverse },
  ctaHint: { fontSize: fp(10), color: colors.text.muted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.sm },

  // Features
  featCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  featBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  featIconWrap: { width: wp(36), height: wp(36), borderRadius: wp(10), backgroundColor: colors.accent.lightBg, alignItems: 'center', justifyContent: 'center' },
  featIcon: { fontSize: fp(16) },
  featInfo: { flex: 1 },
  featTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  featDesc: { fontSize: fp(10), color: colors.text.tertiary, marginTop: wp(1), lineHeight: fp(14) },
  featComparison: { alignItems: 'flex-end' },
  featProLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, backgroundColor: colors.accent.lightBg, borderRadius: radius.sm, paddingHorizontal: wp(6), paddingVertical: wp(2), overflow: 'hidden' },
  featFreeLabel: { fontSize: fp(8), color: colors.text.muted, marginTop: wp(2) },

  // Testimonials
  testimonialCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  testimonialQuote: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' },
  testimonialFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  testimonialAvatar: { width: wp(28), height: wp(28), borderRadius: wp(14), backgroundColor: colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  testimonialInitials: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.inverse },
  testimonialRole: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.muted },

  restoreBtn: { alignItems: 'center', padding: spacing.lg, marginTop: spacing.md },
  restoreText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold },

  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', paddingHorizontal: spacing.lg },

  bottomSpacer: { height: wp(40) },
});
