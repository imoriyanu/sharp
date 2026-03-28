import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS, MAX_PLANS, setPremiumStatus, isPremium } from '../../src/services/premium';
import type { PlanId } from '../../src/types';

const COMPARISON = [
  { feature: 'One Shots',       free: '1/day',   pro: '5/day',   max: '20/day' },
  { feature: 'Threaded',        free: '1/week',  pro: '5/day',   max: '20/day' },
  { feature: 'Industry',        free: '—',       pro: '5/day',   max: '20/day' },
  { feature: 'Practice Again',  free: '—',       pro: '10/day',  max: '20/day' },
  { feature: 'Regenerate',      free: '—',       pro: '2/day',   max: '2/day' },
  { feature: 'Context & Docs',  free: '—',       pro: '✓',       max: '✓' },
  { feature: 'Sharp Summary',   free: '—',       pro: '✓',       max: '✓' },
  { feature: 'Snippet Practice', free: '—',      pro: '✓',       max: '✓' },
  { feature: 'Streak Freeze',   free: '—',       pro: '1/week',  max: '1/week' },
];

const ALL_PLANS = [...PLANS, ...MAX_PLANS];

export default function PremiumScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<PlanId>(isPremium() ? 'max_annual' : 'annual');
  const [purchasing, setPurchasing] = useState(false);

  const selectedPlan = ALL_PLANS.find(p => p.id === selected) || ALL_PLANS[0];
  const isMaxPlan = selected === 'max_monthly' || selected === 'max_annual';

  async function handlePurchase() {
    setPurchasing(true);
    try {
      const expiresAt = selected === 'pass_30'
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : selected === 'monthly' || selected === 'max_monthly'
        ? new Date(Date.now() + 31 * 86400000).toISOString()
        : new Date(Date.now() + 365 * 86400000).toISOString();
      await setPremiumStatus(selected, expiresAt);
      router.back();
    } catch {
      setPurchasing(false);
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
                <Text style={s.speechText}>{isPremium() ? 'Ready for unlimited?' : 'Ready to get sharper?'}</Text>
                <View style={s.speechTail} />
              </View>
            </View>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroHeadline}>
              Speak with clarity, confidence{'\n'}and substance — every time
            </Text>
          </View>
        </FadeIn>

        {/* Proof banner */}
        <FadeIn delay={100}>
          <View style={s.proofCard}>
            <Text style={s.proofIcon}>📈</Text>
            <Text style={s.proofText}>The average Sharp user improves their score by 2+ points in their first month</Text>
          </View>
        </FadeIn>

        {/* === COMPARISON TABLE === */}
        <FadeIn delay={150}>
          <Text style={s.sectionLabel}>Compare plans</Text>
          <View style={s.tableCard}>
            {/* Header */}
            <View style={s.tableHeader}>
              <Text style={s.tableHeaderFeature}>Feature</Text>
              <Text style={s.tableHeaderCol}>Free</Text>
              <Text style={[s.tableHeaderCol, s.tableHeaderPro]}>Pro</Text>
              <Text style={[s.tableHeaderCol, s.tableHeaderMax]}>Max</Text>
            </View>
            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <View key={row.feature} style={[s.tableRow, i < COMPARISON.length - 1 && s.tableRowBorder]}>
                <Text style={s.tableFeature}>{row.feature}</Text>
                <Text style={s.tableCell}>{row.free}</Text>
                <Text style={[s.tableCell, s.tableCellPro]}>{row.pro}</Text>
                <Text style={[s.tableCell, s.tableCellMax]}>{row.max}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* === PRO PLANS === */}
        <FadeIn delay={200}>
          <Text style={s.sectionLabel}>Sharp Pro</Text>
          <Text style={s.sectionSub}>5 sessions per mode · Full coaching features</Text>
          <View style={s.planGroup}>
            {PLANS.map((plan) => {
              const active = selected === plan.id;
              return (
                <TouchableOpacity key={plan.id} style={[s.planCard, active && s.planActive]} onPress={() => setSelected(plan.id)} activeOpacity={0.7}>
                  <View style={[s.radio, active && s.radioOn]}>{active && <View style={s.radioDot} />}</View>
                  <View style={s.planInfo}>
                    <Text style={[s.planName, active && s.planNameActive]}>{plan.name}</Text>
                    <Text style={s.planPrice}>{plan.perMonth}</Text>
                    {plan.period === '/year' && <Text style={s.planBilled}>{plan.price}/year</Text>}
                    {plan.period === 'one-time' && <Text style={s.planBilled}>{plan.price} · no auto-renew</Text>}
                  </View>
                  {plan.savings && <View style={s.savingsBadge}><Text style={s.savingsText}>{plan.savings}</Text></View>}
                  {plan.badge && <View style={[s.badge, plan.recommended ? s.badgeAccent : s.badgeGhost]}><Text style={[s.badgeText, plan.recommended && s.badgeTextAccent]}>{plan.badge}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* === PRO MAX PLANS === */}
        <FadeIn delay={250}>
          <View style={s.maxSection}>
            <View style={s.maxHeader}>
              <View style={s.maxBadge}><Text style={s.maxBadgeText}>PRO MAX</Text></View>
              <Text style={s.maxTitle}>Unlimited practice</Text>
            </View>
            <Text style={s.maxSub}>20 sessions per mode per day · For power users</Text>
            <View style={s.planGroup}>
              {MAX_PLANS.map((plan) => {
                const active = selected === plan.id;
                return (
                  <TouchableOpacity key={plan.id} style={[s.planCard, active && s.planActiveMax]} onPress={() => setSelected(plan.id)} activeOpacity={0.7}>
                    <View style={[s.radio, active && s.radioOnMax]}>{active && <View style={s.radioDotMax} />}</View>
                    <View style={s.planInfo}>
                      <Text style={[s.planName, active && s.planNameMax]}>{plan.name.replace('Max ', '')}</Text>
                      <Text style={s.planPrice}>{plan.perMonth}</Text>
                      {plan.period === '/year' && <Text style={s.planBilled}>{plan.price}/year</Text>}
                    </View>
                    {plan.savings && <View style={s.savingsBadgeMax}><Text style={s.savingsText}>{plan.savings}</Text></View>}
                    {plan.badge && <View style={s.badgeMax}><Text style={s.badgeTextAccent}>{plan.badge}</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={300}>
          <TouchableOpacity style={[s.ctaBtn, isMaxPlan && s.ctaBtnMax, purchasing && s.ctaBtnDisabled]} onPress={handlePurchase} activeOpacity={0.8} disabled={purchasing}>
            <Text style={s.ctaText}>{purchasing ? 'Processing...' : `Get ${selectedPlan.name}`}</Text>
            <Text style={s.ctaSub}>{selectedPlan.perMonth}{selectedPlan.period === '/year' ? ' · billed annually' : selectedPlan.period === 'one-time' ? ' · one-time' : ' · cancel anytime'}</Text>
          </TouchableOpacity>
        </FadeIn>

        {/* Bottom */}
        <FadeIn delay={350}>
          <TouchableOpacity style={s.restoreBtn} activeOpacity={0.7}>
            <Text style={s.restoreText}>Restore purchase</Text>
          </TouchableOpacity>
          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Sprint Pass does not auto-renew.
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

  // Proof
  proofCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl },
  proofIcon: { fontSize: fp(18) },
  proofText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, flex: 1, lineHeight: fp(20) },

  // Section
  sectionLabel: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm, marginTop: spacing.md },
  sectionSub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginBottom: spacing.md },

  // Comparison table
  tableCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.xl, ...shadows.md },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.bg.tertiary },
  tableHeaderFeature: { flex: 1, fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  tableHeaderCol: { width: wp(52), fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textAlign: 'center', textTransform: 'uppercase' as const },
  tableHeaderPro: { color: colors.accent.primary },
  tableHeaderMax: { color: colors.duel.accent },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: wp(10) },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  tableFeature: { flex: 1, fontSize: fp(11), color: colors.text.primary, fontWeight: typography.weight.semibold },
  tableCell: { width: wp(52), fontSize: fp(10), color: colors.text.muted, textAlign: 'center' },
  tableCellPro: { color: colors.accent.primary, fontWeight: typography.weight.bold },
  tableCellMax: { color: colors.duel.accent, fontWeight: typography.weight.bold },

  // Plan cards
  planGroup: { gap: spacing.sm, marginBottom: spacing.md },
  planCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderLight },
  planActive: { borderColor: colors.accent.primary, backgroundColor: colors.accent.light },
  planActiveMax: { borderColor: colors.duel.accent, backgroundColor: colors.duel.bg },
  radio: { width: wp(20), height: wp(20), borderRadius: wp(10), borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  radioOn: { borderColor: colors.accent.primary },
  radioOnMax: { borderColor: colors.duel.accent },
  radioDot: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: colors.accent.primary },
  radioDotMax: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: colors.duel.accent },
  planInfo: { flex: 1 },
  planName: { fontSize: typography.size.sm, fontWeight: typography.weight.black, color: colors.text.primary },
  planNameActive: { color: colors.accent.primary },
  planNameMax: { color: colors.duel.accent },
  planPrice: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.primary, marginTop: wp(2) },
  planBilled: { fontSize: fp(9), color: colors.text.muted, marginTop: wp(1) },
  savingsBadge: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  savingsBadgeMax: { backgroundColor: colors.duel.accent, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  savingsText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 0.5 },
  badge: { position: 'absolute', top: -wp(10), right: wp(16), borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  badgeAccent: { backgroundColor: colors.accent.primary },
  badgeGhost: { backgroundColor: colors.bg.tertiary, borderWidth: 1, borderColor: colors.border },
  badgeMax: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.duel.accent, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  badgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.tertiary },
  badgeTextAccent: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Max section
  maxSection: { backgroundColor: colors.duel.bg, borderWidth: 1.5, borderColor: colors.duel.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  maxHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  maxBadge: { backgroundColor: colors.duel.accent, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  maxBadgeText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 1 },
  maxTitle: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary },
  maxSub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginBottom: spacing.md },

  // CTA
  ctaBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.xl, paddingVertical: wp(18), alignItems: 'center', marginBottom: spacing.lg, ...shadows.accent },
  ctaBtnMax: { backgroundColor: colors.duel.accent },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: fp(16), fontWeight: typography.weight.black, color: colors.text.inverse },
  ctaSub: { fontSize: fp(10), color: 'rgba(255,255,255,0.8)', marginTop: wp(3) },

  // Bottom
  restoreBtn: { alignItems: 'center', padding: spacing.lg },
  restoreText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold },
  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', paddingHorizontal: spacing.lg },
  bottomSpacer: { height: wp(40) },
});
