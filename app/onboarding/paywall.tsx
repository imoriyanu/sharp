import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS } from '../../src/services/premium';

const COMPARE = [
  { feature: 'Daily Challenge', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'One Shot sessions', free: '1/day', pro: '5/day' },
  { feature: 'Threaded practice', free: '1/week', pro: '5/day' },
  { feature: 'Model answers & coaching', free: 'Limited', pro: 'Full access' },
];

export default function OnboardingPaywall() {
  const router = useRouter();
  // Only show Annual (recommended) and Monthly during onboarding
  const annual = PLANS.find(p => p.id === 'annual')!;
  const monthly = PLANS.find(p => p.id === 'monthly')!;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')} style={s.closeBtn}>
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

        {/* Plans — only 2 during onboarding */}
        <FadeIn delay={400}>
          <TouchableOpacity style={[s.planCard, s.planRecommended]} activeOpacity={0.7}>
            <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
            <View style={s.planTop}>
              <Text style={s.planName}>{annual.name}</Text>
              <Text style={s.planSavings}>{annual.savings}</Text>
            </View>
            <Text style={s.planPrice}>{annual.perMonth}</Text>
            <Text style={s.planBilled}>€95.88 billed yearly</Text>
          </TouchableOpacity>
        </FadeIn>

        <FadeIn delay={500}>
          <TouchableOpacity style={s.planCard} activeOpacity={0.7}>
            <Text style={s.planName}>{monthly.name}</Text>
            <Text style={s.planPrice}>{monthly.perMonth}</Text>
          </TouchableOpacity>
        </FadeIn>

        <FadeIn delay={600}>
          <TouchableOpacity style={s.trialBtn} activeOpacity={0.8}>
            <Text style={s.trialText}>Start 7-day free trial</Text>
          </TouchableOpacity>
        </FadeIn>

        <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')}>
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

  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.md },

  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
});
