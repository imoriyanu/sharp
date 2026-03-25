import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble, ProgressDots } from '../../src/components/Illustrations';

export default function ChallengeIntro() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <ProgressDots total={4} current={1} />

        <View style={s.center}>
          <FadeIn delay={200}>
            <SharpFox size={wp(100)} expression="listening" />
          </FadeIn>

          <FadeIn delay={500}>
            <SpeechBubble text="Time to hear you speak! Describe yourself in 30 seconds." variant="accent" />
          </FadeIn>

          <FadeIn delay={900}>
            <View style={s.detailsCard}>
              <Text style={s.detailsTitle}>Your first challenge</Text>
              <Text style={s.detailsQuestion}>"Tell me about yourself — who you are and what you do."</Text>

              <View style={s.metaRow}>
                <View style={s.metaItem}>
                  <Text style={s.metaEmoji}>⏱️</Text>
                  <Text style={s.metaText}>30 seconds</Text>
                </View>
                <View style={s.metaDivider} />
                <View style={s.metaItem}>
                  <Text style={s.metaEmoji}>🎯</Text>
                  <Text style={s.metaText}>5 dimensions</Text>
                </View>
                <View style={s.metaDivider} />
                <View style={s.metaItem}>
                  <Text style={s.metaEmoji}>💡</Text>
                  <Text style={s.metaText}>AI coaching</Text>
                </View>
              </View>
            </View>
          </FadeIn>

          <FadeIn delay={1200}>
            <Text style={s.reassure}>No wrong answers — just speak naturally</Text>
          </FadeIn>
        </View>

        <FadeIn delay={1400}>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/onboarding/recording')} activeOpacity={0.8}>
            <Text style={s.ctaText}>I'm ready</Text>
          </TouchableOpacity>
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, paddingTop: wp(12) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },

  detailsCard: { backgroundColor: colors.bg.secondary, borderRadius: wp(20), padding: spacing.xl, width: '100%', ...shadows.md },
  detailsTitle: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: spacing.sm },
  detailsQuestion: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic', marginBottom: spacing.lg },

  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flex: 1, alignItems: 'center', gap: wp(4) },
  metaDivider: { width: 1, height: wp(24), backgroundColor: colors.borderLight },
  metaEmoji: { fontSize: fp(18) },
  metaText: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  reassure: { fontSize: typography.size.xs, color: colors.text.muted, fontStyle: 'italic' },

  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', marginBottom: wp(16), ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
