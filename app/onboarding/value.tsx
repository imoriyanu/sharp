import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble, FeatureCard } from '../../src/components/Illustrations';

export default function OnboardingValue() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View style={s.heroRow}>
            <SharpFox size={wp(80)} expression="happy" />
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <SpeechBubble text="That was one question. Imagine what happens when you do this every day." variant="accent" />
        </FadeIn>

        <FadeIn delay={600}>
          <Text style={s.heading}>Your communication{'\n'}gym</Text>
        </FadeIn>

        <FeatureCard emoji="☀️" title="Daily Challenge" desc="A new question every day. Build your communication habit." chipLabel="Free" chipColor={colors.success} delay={800} />
        <FeatureCard emoji="⚡" title="Deep Practice" desc="Full coaching with model answers you can listen to." chipLabel="Pro" chipColor={colors.accent.primary} delay={1000} />
        <FeatureCard emoji="⚓" title="Pressure Training" desc="Four rounds of follow-ups. Real conversation pressure." chipLabel="Pro" chipColor={colors.accent.primary} delay={1200} />
        <FeatureCard emoji="📊" title="Sharp Summary" desc="AI reviews your progress and tells you where to focus." chipLabel="Pro" chipColor={colors.accent.primary} delay={1400} />

        <FadeIn delay={1600}>
          <Text style={s.comingSoon}>Coming soon: Sharp Duels ⚔️ · Conversations 💬</Text>
        </FadeIn>

        <FadeIn delay={1800}>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/onboarding/paywall')} activeOpacity={0.8}>
            <Text style={s.ctaText}>Unlock Sharp Pro</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')} activeOpacity={0.7} style={s.skipRow}>
            <Text style={s.skipText}>Start with free plan</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(30) },
  heroRow: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  heading: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5, lineHeight: fp(34), marginTop: spacing.xl, marginBottom: spacing.xl },
  comingSoon: { fontSize: fp(10), color: colors.text.muted, textAlign: 'center', marginVertical: spacing.xl, fontWeight: typography.weight.semibold },
  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  skipRow: { paddingVertical: spacing.lg, alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },
});
