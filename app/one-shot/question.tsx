import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, FadeIn } from '../../src/components/Animations';
import { generateQuestion } from '../../src/services/scoring';
import { playQuestionAudio, stopAudio, buildNaturalScript } from '../../src/services/tts';
import { getContext, getRecentQuestions, addRecentQuestion, getCachedOneShotQuestion, cacheOneShotQuestion, getCachedThreadedQuestion, cacheThreadedQuestion, getRecentSessionHistory, getAverageScores } from '../../src/services/storage';
import { isPremium } from '../../src/services/premium';
import type { GeneratedQuestion } from '../../src/types';

export default function QuestionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isThreaded = params.mode === 'threaded';
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadQuestion(false);
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function loadQuestion(forceNew: boolean) {
    try {
      // Check cache first (unless forcing new)
      if (!forceNew) {
        const cached = isThreaded ? await getCachedThreadedQuestion() : await getCachedOneShotQuestion();
        if (cached) {
          setQuestion(cached);
          setLoading(false);
          setRegenerating(false);
          if (mountedRef.current) {
            setPlaying(true);
            await playQuestionAudio(buildNaturalScript(cached));
            if (mountedRef.current) setPlaying(false);
          }
          return;
        }
      }

      const [ctx, recentQuestions, sessionHistory, averageScores] = await Promise.all([
        getContext(), getRecentQuestions(), getRecentSessionHistory(10), getAverageScores(),
      ]);
      const q = await generateQuestion({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        documents: ctx?.documents || [],
        recentQuestions,
        sessionHistory,
        averageScores,
      });
      await addRecentQuestion(q.question);

      // Cache it
      if (isThreaded) await cacheThreadedQuestion(q);
      else await cacheOneShotQuestion(q);

      if (!mountedRef.current) return;
      setQuestion(q);
      setLoading(false);
      setRegenerating(false);
      setPlaying(true);
      await playQuestionAudio(buildNaturalScript(q));
      if (mountedRef.current) setPlaying(false);
    } catch (e) {
      console.error('Question load error:', e);
      const fallback: GeneratedQuestion = { question: "Tell me about a project you're most proud of and why.", reasoning: '', targets: 'substance', difficulty: 5, contextUsed: [] };
      if (isThreaded) await cacheThreadedQuestion(fallback);
      else await cacheOneShotQuestion(fallback);
      if (!mountedRef.current) return;
      setQuestion(fallback);
      setLoading(false);
      setRegenerating(false);
      setPlaying(true);
      await playQuestionAudio(buildNaturalScript(fallback));
      if (mountedRef.current) setPlaying(false);
    }
  }

  async function regenerate() {
    if (!isPremium()) { router.push('/premium'); return; }
    await stopAudio();
    setRegenerating(true);
    await loadQuestion(true);
  }

  async function replay() {
    if (!question) return;
    setPlaying(true);
    await playQuestionAudio(buildNaturalScript(question));
    if (mountedRef.current) setPlaying(false);
  }

  if (loading || regenerating) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message={regenerating ? "Generating a new question..." : "Generating your question..."} submessage="Sharp is thinking..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.topRow}>
          <Text style={s.tag}>{isThreaded ? 'Threaded Challenge' : 'Sharp asks'}</Text>
          {/* Regenerate button — premium only */}
          <TouchableOpacity onPress={regenerate} activeOpacity={0.7} style={s.regenBtn}>
            <Text style={s.regenText}>{isPremium() ? '↻ New question' : '🔒 New question'}</Text>
          </TouchableOpacity>
        </View>

        {playing && (
          <View style={s.audioPill}>
            <AudioWaveBars active={true} color={colors.accent.primary} height={wp(36)} />
            <Text style={s.audioText}>Playing...</Text>
          </View>
        )}

        {question?.format === 'industry' && question?.newsContext && (
          <FadeIn delay={50}>
            <View style={s.newsCard}>
              <Text style={s.newsLabel}>What's happening</Text>
              <Text style={s.newsText}>{question.newsContext}</Text>
            </View>
          </FadeIn>
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
          <Text style={s.ghostText}>🔊 Replay question</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => router.push({ pathname: '/one-shot/recording', params: { question: question?.question || '', mode: isThreaded ? 'threaded' : 'one_shot', reasoning: question?.reasoning || '', timerSeconds: String(question?.timerSeconds || 90) } })}
          activeOpacity={0.8}
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  tag: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2 },
  regenBtn: { paddingVertical: wp(4), paddingHorizontal: wp(10) },
  regenText: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.accent.primary },
  audioPill: { flexDirection: 'row', alignItems: 'center', gap: wp(6), backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'flex-start', marginBottom: spacing.lg },
  audioText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },
  questionText: { fontSize: fp(18), color: colors.text.primary, lineHeight: fp(28), fontWeight: typography.weight.bold, marginBottom: spacing.xl },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  diffLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const },
  dots: { flexDirection: 'row', gap: wp(3) },
  dot: { width: wp(6), height: wp(6), borderRadius: wp(3), backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent.primary },
  newsCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1.5, borderColor: colors.border },
  newsLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  newsText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },
  spacer: { flex: 1 },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginBottom: spacing.sm },
  ghostText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
