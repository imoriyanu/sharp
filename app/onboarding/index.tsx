import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble } from '../../src/components/Illustrations';
import { trackEvent, Events } from '../../src/services/analytics';

export default function OnboardingHook() {
  const router = useRouter();

  useEffect(() => { trackEvent(Events.ONBOARDING_STARTED); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.top}>
          <FadeIn delay={200}>
            <SharpFox size={wp(100)} expression="happy" />
          </FadeIn>

          <FadeIn delay={600}>
            <SpeechBubble text="The best communicators aren't born. They practice. I'll show you how in 30 seconds." delay={0} />
          </FadeIn>
        </View>

        <View style={s.middle}>
          <FadeIn delay={1000}>
            <Text style={s.headline}>Your words{'\n'}are your{'\n'}superpower.</Text>
          </FadeIn>

          <FadeIn delay={1400}>
            <Text style={s.sub}>Interviews. Pitches. Tough conversations. Sharp trains you to nail them all with AI that listens, scores, and coaches you in real time.</Text>
          </FadeIn>

          <FadeIn delay={1800}>
            <View style={s.proofRow}>
              <View style={s.proofItem}>
                <Text style={s.proofNumber}>30s</Text>
                <Text style={s.proofLabel}>per day</Text>
              </View>
              <View style={s.proofDivider} />
              <View style={s.proofItem}>
                <Text style={s.proofNumber}>5</Text>
                <Text style={s.proofLabel}>dimensions</Text>
              </View>
              <View style={s.proofDivider} />
              <View style={s.proofItem}>
                <Text style={s.proofNumber}>AI</Text>
                <Text style={s.proofLabel}>coach</Text>
              </View>
            </View>
          </FadeIn>
        </View>

        <FadeIn delay={2200}>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/onboarding/name')} activeOpacity={0.8}>
            <Text style={s.ctaText}>Find out how sharp you are</Text>
          </TouchableOpacity>
          <Text style={s.ctaSub}>Free. 30 seconds. No card needed.</Text>
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },

  top: { alignItems: 'center', paddingTop: wp(20), gap: spacing.md },

  middle: { flex: 1, justifyContent: 'center' },
  headline: {
    fontSize: fp(34),
    fontWeight: typography.weight.black,
    color: colors.text.primary,
    letterSpacing: -1.2,
    lineHeight: fp(42),
  },
  sub: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
    lineHeight: fp(22),
    marginTop: spacing.lg,
  },

  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxl,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-around',
    ...shadows.sm,
  },
  proofItem: { alignItems: 'center' },
  proofNumber: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.accent.primary },
  proofLabel: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginTop: 2 },
  proofDivider: { width: 1, height: wp(28), backgroundColor: colors.borderLight },

  cta: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.accent,
  },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaSub: { fontSize: fp(10), color: colors.text.muted, textAlign: 'center', marginBottom: wp(12) },
});
