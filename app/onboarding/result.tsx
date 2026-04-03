import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { SharpFox, ConfettiBurst, ProgressDots } from '../../src/components/Illustrations';
import { playCoachingAudio, stopAudio } from '../../src/services/tts';

export default function OnboardingResult() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const scores = JSON.parse((p.scores as string) || '{}');
  const overall = parseFloat((p.overall as string) || '0');
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const coachingInsight = (p.coachingInsight as string) || '';
  const mountedRef = useRef(true);

  const DIMS = ['structure', 'concision', 'substance', 'fillerWords'] as const;
  const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words' };

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(async () => {
      if (mountedRef.current && coachingInsight) {
        const spoken = `Nice work on your first try! Here's your coaching insight: ${coachingInsight}`;
        await playCoachingAudio(spoken);
      }
    }, 2500);
    return () => { mountedRef.current = false; clearTimeout(timer); stopAudio(); };
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn><ProgressDots total={4} current={3} /></FadeIn>

        {/* Celebration */}
        <FadeIn delay={200}>
          <View style={s.celebRow}>
            <ConfettiBurst />
            <SharpFox size={wp(100)} expression="celebrating" />
          </View>
        </FadeIn>

        {/* Score */}
        <FadeIn delay={600}>
          <View style={s.scoreCard}>
            <Text style={s.scoreLabel}>YOUR FIRST SHARP SCORE</Text>
            <View style={[s.ring, { borderColor: getScoreColor(overall) }]}>
              <ScoreReveal score={overall} color={getScoreColor(overall)} size={fp(42)} />
            </View>
            <Text style={s.scoreContext}>
              {overall >= 7 ? "Impressive start! You're a natural." : overall >= 5 ? "Solid foundation — real potential here." : "Great first step — everyone starts here."}
            </Text>
          </View>
        </FadeIn>

        {/* Dimensions */}
        <FadeIn delay={1000}>
          <View style={s.dimCard}>
            {DIMS.map((dim, i) => {
              const val = scores[dim] || 0;
              return (
                <View key={dim} style={s.dimRow}>
                  <Text style={s.dimName}>{DIM_LABELS[dim]}</Text>
                  <View style={s.dimTrack}><View style={[s.dimFill, { width: `${val * 10}%`, backgroundColor: getScoreColor(val) }]} /></View>
                  <Text style={[s.dimVal, { color: getScoreColor(val) }]}>{val}</Text>
                </View>
              );
            })}
          </View>
        </FadeIn>

        {/* Positives */}
        {positives ? (
          <FadeIn delay={1400}>
            <View style={s.positiveCard}>
              <Text style={s.cardEmoji}>✅</Text>
              <Text style={s.cardLabel}>What you did well</Text>
              <Text style={s.positiveText}>{positives}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Insight */}
        {coachingInsight ? (
          <FadeIn delay={1800}>
            <View style={s.insightCard}>
              <Text style={s.cardEmoji}>💡</Text>
              <Text style={s.cardLabel}>Your first coaching insight</Text>
              <Text style={s.insightText}>{coachingInsight}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Improvement */}
        {improvements ? (
          <FadeIn delay={2200}>
            <View style={s.improveCard}>
              <Text style={s.improveText}>{improvements}</Text>
            </View>
          </FadeIn>
        ) : null}

        <FadeIn delay={2600}>
          <TouchableOpacity style={s.cta} onPress={() => { stopAudio(); router.replace('/onboarding/value'); }} activeOpacity={0.8}>
            <Text style={s.ctaText}>See what's next</Text>
            <Text style={s.ctaArrow}>→</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingTop: wp(16), paddingBottom: wp(40) },

  celebRow: { alignItems: 'center', marginVertical: spacing.lg },

  scoreCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', ...shadows.lg, marginBottom: spacing.lg },
  scoreLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, marginBottom: spacing.lg },
  ring: { width: wp(110), height: wp(110), borderRadius: wp(55), borderWidth: wp(5), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  scoreContext: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', fontWeight: typography.weight.semibold },

  dimCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.lg },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(8) },
  dimName: { fontSize: fp(11), color: colors.text.secondary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(8), backgroundColor: colors.borderLight, borderRadius: wp(4), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(4) },
  dimVal: { fontSize: fp(15), fontWeight: typography.weight.black, width: wp(26), textAlign: 'right' },

  cardEmoji: { fontSize: fp(20), marginBottom: spacing.sm },
  cardLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },

  positiveCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },
  positiveText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold, textAlign: 'center' },

  insightCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },
  insightText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold, textAlign: 'center' },

  improveCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xxl, ...shadows.sm },
  improveText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), textAlign: 'center' },

  cta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaArrow: { fontSize: typography.size.md, color: colors.text.inverse, opacity: 0.7 },
});
