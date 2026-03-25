import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { PLANS } from '../../src/services/premium';

const FEATURES = [
  { emoji: '⚡', title: '5 One Shots per day', free: '1/day' },
  { emoji: '⚓', title: '5 Threaded per day', free: '1/week' },
  { emoji: '🎤', title: '10 Practice Again per day', free: 'Not available' },
  { emoji: '🎯', title: 'Custom context & documents', free: 'Not available' },
  { emoji: '📊', title: 'Sharp Summary & analytics', free: 'Not available' },
  { emoji: '✨', title: 'Snippet coaching practice', free: 'Not available' },
  { emoji: '❄️', title: 'Streak freeze (1/week)', free: 'Not available' },
];

export default function PremiumScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <Text style={s.close}>×</Text>
        </TouchableOpacity>

        <FadeIn>
          <View style={s.hero}>
            <Text style={s.heroEmoji}>👑</Text>
            <Text style={s.heroTitle}>Sharp Pro</Text>
            <Text style={s.heroSub}>Unlock your full communication potential</Text>
          </View>
        </FadeIn>

        {/* Features */}
        <FadeIn delay={100}>
          <View style={s.featCard}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[s.featRow, i < FEATURES.length - 1 && s.featBorder]}>
                <Text style={s.featEmoji}>{f.emoji}</Text>
                <View style={s.featInfo}>
                  <Text style={s.featTitle}>{f.title}</Text>
                  <Text style={s.featFree}>Free: {f.free}</Text>
                </View>
                <Text style={s.featCheck}>✓</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Plans */}
        <Text style={s.section}>Choose your plan</Text>
        {PLANS.map((plan, i) => (
          <FadeIn key={plan.id} delay={200 + i * 50}>
            <TouchableOpacity style={[s.planCard, plan.recommended && s.planRecommended]} activeOpacity={0.7}>
              {plan.recommended && (
                <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
              )}
              {plan.badge && !plan.recommended && (
                <View style={s.planBadge}><Text style={s.planBadgeText}>{plan.badge}</Text></View>
              )}
              <View style={s.planTop}>
                <Text style={s.planName}>{plan.name}</Text>
                {plan.savings && <Text style={s.planSavings}>{plan.savings}</Text>}
              </View>
              <View style={s.planPricing}>
                <Text style={s.planPerMonth}>{plan.perMonth}</Text>
                {plan.period !== '/month' && plan.period !== 'one-time' && (
                  <Text style={s.planBilled}>{plan.price} billed {plan.period.replace('/', '')}</Text>
                )}
                {plan.period === 'one-time' && (
                  <Text style={s.planBilled}>{plan.price} one-time, no renewal</Text>
                )}
              </View>
            </TouchableOpacity>
          </FadeIn>
        ))}

        <FadeIn delay={500}>
          <TouchableOpacity style={s.restoreBtn} activeOpacity={0.7}>
            <Text style={s.restoreText}>Restore purchase</Text>
          </TouchableOpacity>

          <Text style={s.legal}>
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless it is cancelled at least 24 hours before the end of the current period.
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
  hero: { alignItems: 'center', marginBottom: spacing.xxl, marginTop: spacing.lg },
  heroEmoji: { fontSize: fp(44), marginBottom: spacing.md },
  heroTitle: { fontSize: fp(30), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5 },
  heroSub: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: wp(4) },

  // Features
  featCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.xxl, ...shadows.md },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  featBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  featEmoji: { fontSize: fp(16) },
  featInfo: { flex: 1 },
  featTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  featFree: { fontSize: fp(9), color: colors.text.muted, marginTop: 1 },
  featCheck: { fontSize: fp(14), color: colors.success, fontWeight: typography.weight.bold },

  // Section
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },

  // Plans
  planCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.sm },
  planRecommended: { borderColor: colors.accent.primary, borderWidth: 2, ...shadows.accent },
  recBadge: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(3) },
  recBadgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.inverse },
  planBadge: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  planBadgeText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.tertiary },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  planName: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary },
  planSavings: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success, backgroundColor: colors.feedback.positiveBg, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  planPricing: {},
  planPerMonth: { fontSize: fp(22), fontWeight: typography.weight.black, color: colors.accent.primary },
  planBilled: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: wp(2) },

  restoreBtn: { alignItems: 'center', padding: spacing.lg },
  restoreText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold },

  legal: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', paddingHorizontal: spacing.lg },

  bottomSpacer: { height: wp(40) },
});
