import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, FadeIn } from '../../src/components/Animations';
import { generateQuestion } from '../../src/services/scoring';
import { playQuestionAudio, stopAudio, buildNaturalScript } from '../../src/services/tts';
import { getContext, getRecentQuestions, addRecentQuestion } from '../../src/services/storage';
import type { GeneratedQuestion } from '../../src/types';

export default function QuestionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isThreaded = params.mode === 'threaded';
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestion();
    return () => { stopAudio(); };
  }, []);

  async function loadQuestion() {
    try {
      const [ctx, recentQuestions] = await Promise.all([getContext(), getRecentQuestions()]);
      const q = await generateQuestion({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        documents: ctx?.documents || [],
        recentQuestions,
      });
      await addRecentQuestion(q.question);
      setQuestion(q);
      setLoading(false);
      setPlaying(true);
      await playQuestionAudio(buildNaturalScript(q));
      setPlaying(false);
    } catch (e) {
      console.error('Question load error:', e);
      const fallback: GeneratedQuestion = { question: "Tell me about a project you're most proud of and why.", reasoning: '', targets: 'substance', difficulty: 5, contextUsed: [] };
      setQuestion(fallback);
      setLoading(false);
      setPlaying(true);
      await playQuestionAudio(buildNaturalScript(fallback));
      setPlaying(false);
    }
  }

  async function replay() {
    if (!question) return;
    setPlaying(true);
    await playQuestionAudio(buildNaturalScript(question));
    setPlaying(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message="Generating your question..." submessage="Sharp is thinking..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.tag}>Sharp asks</Text>

        {playing && (
          <View style={s.audioPill}>
            <AudioWaveBars active={true} color={colors.accent.primary} height={wp(36)} />
            <Text style={s.audioText}>Playing...</Text>
          </View>
        )}

        <FadeIn delay={100}>
          <Text style={s.questionText}>
            {`"${question?.question}"`}
          </Text>
        </FadeIn>

        {question && (
          <FadeIn delay={300}>
            <View style={s.diffRow}>
              <Text style={s.diffLabel}>Difficulty</Text>
              <View style={s.dots}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <View key={i} style={[s.dot, i < (question.difficulty || 5) && s.dotOn]} />
                ))}
              </View>
            </View>
          </FadeIn>
        )}

        <View style={s.spacer} />

        <TouchableOpacity style={s.ghostBtn} onPress={replay} activeOpacity={0.7}>
          <Text style={s.ghostText}>↻ Replay question</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => router.push({ pathname: '/one-shot/recording', params: { question: question?.question || '', mode: isThreaded ? 'threaded' : 'one_shot', reasoning: question?.reasoning || '', timerSeconds: String(question?.timerSeconds || 90) } })}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Text style={s.mainText}>🎤 Record my answer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, justifyContent: 'center' },
  tag: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: spacing.lg },
  audioPill: { flexDirection: 'row', alignItems: 'center', gap: wp(6), backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'flex-start', marginBottom: spacing.lg },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: wp(14) },
  bar: { width: 2.5, borderRadius: 2, backgroundColor: colors.accent.primary },
  audioText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },
  questionText: { fontSize: fp(16), color: colors.text.primary, lineHeight: fp(26), fontWeight: typography.weight.semibold, marginBottom: spacing.xl },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  diffLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const },
  dots: { flexDirection: 'row', gap: wp(3) },
  dot: { width: wp(6), height: wp(6), borderRadius: wp(3), backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent.primary },
  spacer: { flex: 1 },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginBottom: spacing.sm },
  ghostText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
