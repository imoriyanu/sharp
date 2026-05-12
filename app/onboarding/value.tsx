import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FEATURES } from '../../src/constants/features';
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
          <SpeechBubble text="That was just a taste. People who train with Sharp for 7 days see their scores jump 20-40%. Ready?" variant="accent" />
        </FadeIn>

        <FadeIn delay={600}>
          <Text style={s.heading}>One habit.{'\n'}Five minutes.{'\n'}Everything changes.</Text>
          <Text style={s.subheading}>The best speakers aren't talented. They're trained. Sharp gives you the reps and the feedback to get there.</Text>
        </FadeIn>

        <FeatureCard emoji="☀️" title="Daily 30" desc="A fresh challenge every morning. 30 seconds to answer. Instant scoring. Build the habit that compounds." chipLabel="Free" chipColor={colors.success} delay={800} />
        <FeatureCard emoji="⚡" title="Deep Practice" desc="Full AI coaching with before/after rewrites. Hear the model answer. See exactly where your words fell short." chipLabel="Pro" chipColor={colors.accent.primary} delay={1000} />
        {FEATURES.conversation && (
          <FeatureCard emoji="💬" title="Live Conversations" desc="Talk to an AI agent who plays your interviewer, manager, or investor. Real-time voice, real pressure." chipLabel="Pro" chipColor={colors.accent.primary} delay={1200} />
        )}
        <FeatureCard emoji="⚓" title="Pressure Rounds" desc="Four escalating follow-ups that push harder each turn. The closest thing to a real high-stakes conversation." chipLabel="Pro" chipColor={colors.accent.primary} delay={1400} />

        <FadeIn delay={1600}>
          <View style={s.dimCard}>
            <Text style={s.dimTitle}>Scored on 5 dimensions. Every time.</Text>
            <View style={s.dimGrid}>
              {['Structure', 'Concision', 'Substance', 'Filler Words', 'Awareness'].map((dim, i) => (
                <View key={dim} style={s.dimChip}>
                  <Text style={s.dimChipText}>{dim}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={1800}>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/onboarding/paywall')} activeOpacity={0.8}>
            <Text style={s.ctaText}>Unlock Sharp Pro</Text>
            <Text style={s.ctaSub}>{FEATURES.conversation ? 'Unlimited coaching, conversations, and analytics' : 'Unlimited coaching and analytics'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')} activeOpacity={0.7} style={s.skipRow}>
            <Text style={s.skipText}>Continue with free plan</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(30) },
  heroRow: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.xs },

  heading: {
    fontSize: fp(28),
    fontWeight: typography.weight.black,
    color: colors.text.primary,
    letterSpacing: -0.8,
    lineHeight: fp(36),
    marginTop: spacing.xl,
  },
  subheading: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: fp(20),
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },

  dimCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginVertical: spacing.md,
    ...shadows.sm,
  },
  dimTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  dimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dimChip: {
    backgroundColor: colors.accent.light,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent.border,
  },
  dimChipText: {
    fontSize: fp(10),
    fontWeight: typography.weight.bold,
    color: colors.accent.dark,
  },

  cta: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    alignItems: 'center',
    ...shadows.accent,
  },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaSub: { fontSize: fp(10), color: colors.text.inverse, opacity: 0.7, marginTop: 2 },
  skipRow: { paddingVertical: spacing.lg, alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },
});
