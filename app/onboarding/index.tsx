import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble } from '../../src/components/Illustrations';

export default function OnboardingHook() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.top}>
          <FadeIn delay={300}>
            <SharpFox size={wp(110)} expression="happy" />
          </FadeIn>

          <FadeIn delay={700}>
            <SpeechBubble text="Hey! I'm Sharp — your AI communication coach. Let me show you what I can do." delay={0} />
          </FadeIn>
        </View>

        <View style={s.textSection}>
          <FadeIn delay={1100}>
            <Text style={s.headline}>Communication{'\n'}powers everything.</Text>
          </FadeIn>

          <FadeIn delay={1500}>
            <Text style={s.sub}>Your career, your relationships, your ideas — they're only as strong as your ability to express them clearly.</Text>
          </FadeIn>

          <FadeIn delay={1900}>
            <View style={s.pillRow}>
              <View style={s.pill}><Text style={s.pillText}>🎯 Score your clarity</Text></View>
              <View style={s.pill}><Text style={s.pillText}>🤖 AI coaching</Text></View>
              <View style={s.pill}><Text style={s.pillText}>📈 Track progress</Text></View>
            </View>
          </FadeIn>
        </View>

        <FadeIn delay={2300}>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/onboarding/name')} activeOpacity={0.8}>
            <Text style={s.ctaText}>See how sharp you are</Text>
          </TouchableOpacity>
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  top: { alignItems: 'center', paddingTop: wp(30), gap: spacing.lg },
  textSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headline: { fontSize: fp(30), fontWeight: typography.weight.black, color: colors.text.primary, textAlign: 'center', letterSpacing: -0.8, lineHeight: fp(38) },
  sub: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(20), marginTop: spacing.md, paddingHorizontal: spacing.md },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  pill: { backgroundColor: colors.accent.light, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(8), borderWidth: 1, borderColor: colors.accent.border },
  pillText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.accent.dark },
  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', marginBottom: wp(16), ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
