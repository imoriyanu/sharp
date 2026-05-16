import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { SharpFox, ConfettiBurst, ProgressDots } from '../../src/components/Illustrations';
import { playCoachingAudio, playModelAudio, stopAudio } from '../../src/services/tts';

export default function OnboardingResult() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const scores = JSON.parse((p.scores as string) || '{}');
  const overall = parseFloat((p.overall as string) || '0');
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const coachingInsight = (p.coachingInsight as string) || '';
  const modelAnswer = (p.modelAnswer as string) || '';
  const mountedRef = useRef(true);
  // Tracks which audio source is currently playing so the model-answer card
  // can show the right play/pause state. Only one TTS plays at a time.
  const [playingKey, setPlayingKey] = useState<'insight' | 'model' | null>(null);

  const DIMS = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
  const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

  useEffect(() => {
    mountedRef.current = true;
    // Auto-play sequence: coaching insight first (the surprising critique),
    // then the model answer (the conversion lever). The model answer is the
    // strongest argument for upgrading. Hearing a 9/10 in the coach voice
    // makes the gap visceral. Sequence is fire-and-forget; if either fails,
    // user can tap to replay.
    if (coachingInsight) {
      setPlayingKey('insight');
      const spoken = `Nice work on your first try! Here's your coaching insight: ${coachingInsight}`;
      playCoachingAudio(spoken)
        .then(() => {
          if (!mountedRef.current) return;
          setPlayingKey(null);
          // Chain model answer playback after the insight finishes. Gives
          // the user a moment to process before the contrast lands.
          if (modelAnswer) {
            setPlayingKey('model');
            const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
            playModelAudio(spokenModel)
              .catch(() => {})
              .finally(() => { if (mountedRef.current) setPlayingKey(null); });
          }
        })
        .catch(() => { if (mountedRef.current) setPlayingKey(null); });
    } else if (modelAnswer) {
      // No insight (rare). Play model answer first.
      setPlayingKey('model');
      const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
      playModelAudio(spokenModel)
        .catch(() => {})
        .finally(() => { if (mountedRef.current) setPlayingKey(null); });
    }
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  // Replay handler for the model answer card. Toggles play/pause: if model
  // is currently playing, stop it; otherwise start fresh.
  async function toggleModelPlayback() {
    if (!modelAnswer) return;
    if (playingKey === 'model') {
      await stopAudio();
      setPlayingKey(null);
      return;
    }
    await stopAudio();
    if (!mountedRef.current) return;
    setPlayingKey('model');
    const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
    await playModelAudio(spokenModel).catch(() => {});
    if (mountedRef.current) setPlayingKey(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn><ProgressDots total={5} current={4} /></FadeIn>

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
              {overall >= 7 ? "You're a natural communicator. Imagine what daily practice could do." : overall >= 5 ? "Solid start. Most people score here, but the ones who train daily don't stay here." : "Every sharp speaker started right where you are. The difference is what happens next."}
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

        {/* Model Answer. The conversion lever. Auto-plays once after the
            coaching insight finishes. Hearing a 9/10 in the coach voice
            makes the gap visceral. This is the strongest argument for
            upgrading; post-onboarding result screens Pro-gate this. */}
        {modelAnswer ? (
          <FadeIn delay={2000}>
            <TouchableOpacity style={s.modelCard} onPress={toggleModelPlayback} activeOpacity={0.85}>
              <View style={s.modelHeader}>
                <View>
                  <Text style={s.modelLabel}>HERE'S WHAT A 9.0 SOUNDS LIKE</Text>
                  <Text style={s.modelSubLabel}>Built from your response</Text>
                </View>
                <View style={[s.modelListenBtn, playingKey === 'model' && s.modelListenBtnActive]}>
                  <Text style={s.modelListenText}>{playingKey === 'model' ? '⏸ Pause' : '🔊 Replay'}</Text>
                </View>
              </View>
              <Text style={s.modelText}>"{modelAnswer}"</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* Improvement */}
        {improvements ? (
          <FadeIn delay={2400}>
            <View style={s.improveCard}>
              <Text style={s.improveText}>{improvements}</Text>
            </View>
          </FadeIn>
        ) : null}

        <FadeIn delay={2800}>
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
  scoreLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, marginBottom: spacing.lg },
  ring: { width: wp(110), height: wp(110), borderRadius: wp(55), borderWidth: wp(5), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  scoreContext: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', fontWeight: typography.weight.semibold },

  dimCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.lg },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(8) },
  dimName: { fontSize: fp(11), color: colors.text.secondary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(8), backgroundColor: colors.borderLight, borderRadius: wp(4), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(4) },
  dimVal: { fontSize: fp(15), fontWeight: typography.weight.black, width: wp(26), textAlign: 'right' },

  cardEmoji: { fontSize: fp(20), marginBottom: spacing.sm },
  cardLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },

  positiveCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },
  positiveText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold, textAlign: 'center' },

  insightCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },
  insightText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold, textAlign: 'center' },

  // Model answer. Strongest conversion lever. Sage-green card with terracotta
  // CTA chip so the contrast lands. Sits between insight and improvement so
  // it follows the "here's your gap" beat with "here's what closing it sounds
  // like".
  modelCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadows.sm },
  modelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.md },
  modelLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.success, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  modelSubLabel: { fontSize: fp(10), color: colors.text.muted, marginTop: 2 },
  modelListenBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5), ...shadows.accent },
  modelListenBtnActive: { backgroundColor: colors.accent.dark },
  modelListenText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.inverse, letterSpacing: 0.3 },
  modelText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic' as const, fontWeight: typography.weight.semibold },

  improveCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xxl, ...shadows.sm },
  improveText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), textAlign: 'center' },

  cta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaArrow: { fontSize: typography.size.md, color: colors.text.inverse, opacity: 0.7 },
});
