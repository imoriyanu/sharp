import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, FadeIn } from '../../src/components/Animations';
import { generateQuestion } from '../../src/services/scoring';
import { playQuestionAudio, stopAudio, buildNaturalScript, getQuestionVoiceMode } from '../../src/services/tts';
import { getContext, getRecentQuestions, addRecentQuestion, getCachedOneShotQuestion, cacheOneShotQuestion, getCachedThreadedQuestion, cacheThreadedQuestion, getCachedIndustryQuestion, cacheIndustryQuestion, clearIndustryQuestionCache, saveThreadState, clearThreadState, getRecentSessionHistory, getAverageScores } from '../../src/services/storage';
import { isPremium, canRegenerate, trackRegenerateUsage, trackIndustryUsage, resetRegenCount } from '../../src/services/premium';
import type { GeneratedQuestion } from '../../src/types';

export default function QuestionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isThreaded = params.mode === 'threaded';
  const isIndustry = params.mode === 'industry';
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [playing, setPlaying] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenLeft, setRegenLeft] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    abortRef.current = new AbortController();
    resetRegenCount(); // Reset per-question regen counter
    const r = canRegenerate();
    setRegenLeft(r.limit - r.used);
    loadQuestion(false);
    if (isIndustry) trackIndustryUsage();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      stopAudio();
    };
  }, []);

  async function loadQuestion(forceNew: boolean) {
    const signal = abortRef.current?.signal;
    try {
      // Check cache first (unless forcing new)
      if (!forceNew) {
        const cached = isIndustry
          ? await getCachedIndustryQuestion()
          : isThreaded
          ? await getCachedThreadedQuestion()
          : await getCachedOneShotQuestion();
        if (cached) {
          if (!mountedRef.current) return;
          setQuestion(cached);
          setLoading(false);
          setRegenerating(false);
          setPlaying(true);
          const played = await playQuestionAudio(buildNaturalScript(cached), signal, getQuestionVoiceMode(cached));
          if (mountedRef.current) { setPlaying(false); if (!played) setTextOnly(true); }
          return;
        }
      }

      const [ctx, recentQuestions, sessionHistory, averageScores] = await Promise.all([
        getContext(), getRecentQuestions(), getRecentSessionHistory(), getAverageScores(),
      ]);
      const documentExtractions = (ctx?.documents || []).map(d => d.structuredExtraction).filter(Boolean);
      const q = await generateQuestion({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        notes: ctx?.notes || '',
        documents: ctx?.documents || [],
        documentExtractions,
        recentQuestions,
        sessionHistory,
        averageScores: averageScores || undefined,
        ...(isIndustry ? { forceFormat: 'industry' } : {}),
      }, signal);
      await addRecentQuestion(q.question);

      // Cache it — each mode has its own cache
      if (isIndustry) await cacheIndustryQuestion(q);
      else if (isThreaded) await cacheThreadedQuestion(q);
      else await cacheOneShotQuestion(q);

      if (!mountedRef.current) return;
      setQuestion(q);
      setLoading(false);
      setRegenerating(false);
      setPlaying(true);
      const played = await playQuestionAudio(buildNaturalScript(q), signal, getQuestionVoiceMode(q));
      if (mountedRef.current) { setPlaying(false); if (!played) setTextOnly(true); }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      __DEV__ && console.error('Question load error:', e);
      const fallback: GeneratedQuestion = { question: "Tell me about a project you're most proud of and why.", reasoning: '', targets: 'substance', difficulty: 5, contextUsed: [] };
      if (isIndustry) await cacheIndustryQuestion(fallback);
      else if (isThreaded) await cacheThreadedQuestion(fallback);
      else await cacheOneShotQuestion(fallback);
      if (!mountedRef.current) return;
      setQuestion(fallback);
      setLoading(false);
      setRegenerating(false);
      setPlaying(true);
      const played = await playQuestionAudio(buildNaturalScript(fallback), signal, getQuestionVoiceMode(fallback));
      if (mountedRef.current) { setPlaying(false); if (!played) setTextOnly(true); }
    }
  }

  async function regenerate() {
    if (!isPremium()) { router.push('/premium'); return; }
    const check = canRegenerate();
    if (!check.allowed) return;
    trackRegenerateUsage();
    setRegenLeft(check.limit - check.used - 1);
    // Abort the old request and create a fresh controller for the new one
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    await stopAudio();
    setRegenerating(true);
    await loadQuestion(true);
  }

  async function replay() {
    if (!question) return;
    setPlaying(true);
    const played = await playQuestionAudio(buildNaturalScript(question), abortRef.current?.signal, getQuestionVoiceMode(question));
    if (mountedRef.current) { setPlaying(false); if (!played) setTextOnly(true); }
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
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.topRow}>
            <TouchableOpacity onPress={() => { stopAudio(); router.back(); }} hitSlop={12} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.tag}>{isThreaded ? 'Threaded Challenge' : isIndustry ? 'Industry Insight' : 'Sharp asks'}</Text>
            <TouchableOpacity onPress={regenerate} activeOpacity={0.7} style={[s.regenBtn, regenLeft === 0 && { opacity: 0.3 }]} disabled={regenLeft === 0}>
              <Text style={s.regenText}>{!isPremium() ? '🔒 New question' : regenLeft === 0 ? 'No regens left' : `↻ New (${regenLeft})`}</Text>
            </TouchableOpacity>
          </View>

          {playing && (
            <View style={s.audioPill}>
              <AudioWaveBars active={true} color={colors.accent.primary} height={wp(36)} />
              <Text style={s.audioText}>Playing...</Text>
            </View>
          )}
          {textOnly && !playing && (
            <View style={s.textOnlyPill}>
              <Text style={s.textOnlyText}>Text only mode</Text>
            </View>
          )}

          {/* Industry TLDR briefing */}
          {question?.format === 'industry' && question.newsContext && (
            <FadeIn delay={50}>
              <View style={s.newsCard}>
                <View style={s.newsHeader}>
                  <Text style={s.newsIcon}>📰</Text>
                  <View style={s.newsBadge}><Text style={s.newsBadgeText}>INDUSTRY BRIEFING</Text></View>
                </View>
                <Text style={s.newsTldr}>TLDR</Text>
                <Text style={s.newsText}>{question.newsContext}</Text>
                {question.learnMore?.topic && (
                  <View style={s.newsTopicRow}>
                    <Text style={s.newsTopicLabel}>Topic:</Text>
                    <Text style={s.newsTopicText}>{question.learnMore.topic}</Text>
                  </View>
                )}
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

          {/* Learn more — real articles + search */}
          {question?.format === 'industry' && question.learnMore && (
            <FadeIn delay={400}>
              <View style={s.learnCard}>
                <Text style={s.learnLabel}>📖 Read more</Text>
                <Text style={s.learnHint}>{question.learnMore.suggestedReading}</Text>

                {/* Real article links */}
                {question.learnMore.articles && question.learnMore.articles.filter(a => a && a.startsWith('http')).length > 0 && (
                  <View style={s.learnLinks}>
                    <Text style={s.learnSectionLabel}>Articles</Text>
                    {question.learnMore.articles.filter(a => a && a.startsWith('http')).map((url, i) => {
                      const domain = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
                      return (
                        <TouchableOpacity key={i} style={s.learnLink} onPress={() => Linking.openURL(url).catch(() => {})} activeOpacity={0.7}>
                          <Text style={s.learnLinkIcon}>📄</Text>
                          <Text style={s.learnLinkText} numberOfLines={1}>{domain}</Text>
                          <Text style={s.learnLinkArrow}>→</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Search terms */}
                <View style={s.learnLinks}>
                  <Text style={s.learnSectionLabel}>Search</Text>
                  {question.learnMore.searchTerms.map((term, i) => (
                    <TouchableOpacity key={i} style={s.learnLink} onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(term)}`).catch(() => {})} activeOpacity={0.7}>
                      <Text style={s.learnLinkIcon}>🔍</Text>
                      <Text style={s.learnLinkText}>{term}</Text>
                      <Text style={s.learnLinkArrow}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </FadeIn>
          )}

          <View style={{ height: spacing.lg }} />
        </ScrollView>

        {/* Pinned buttons */}
        <View style={s.btnArea}>
          {!textOnly && (
            <TouchableOpacity style={s.ghostBtn} onPress={replay} activeOpacity={0.7}>
              <Text style={s.ghostText}>🔊 Replay question</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.mainBtn}
            onPress={async () => {
              if (isThreaded && question) {
                await clearThreadState();
                await saveThreadState({ originalQuestion: question.question, turns: [], startedAt: new Date().toISOString() });
              }
              router.push({ pathname: '/one-shot/recording', params: { question: question?.question || '', mode: isThreaded ? 'threaded' : 'one_shot', reasoning: question?.reasoning || '', timerSeconds: String(question?.timerSeconds || 90) } });
            }}
            activeOpacity={0.8}
          >
            <Text style={s.mainText}>🎤 Record my answer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: layout.screenPadding, paddingBottom: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  backBtn: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  tag: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2 },
  regenBtn: { paddingVertical: wp(4), paddingHorizontal: wp(10) },
  regenText: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.accent.primary },
  audioPill: { flexDirection: 'row', alignItems: 'center', gap: wp(6), backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'flex-start', marginBottom: spacing.lg },
  audioText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },
  textOnlyPill: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'flex-start', marginBottom: spacing.lg },
  textOnlyText: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.muted },
  newsCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.md },
  newsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  newsIcon: { fontSize: fp(18) },
  newsBadge: { backgroundColor: colors.industry.bg, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  newsBadgeText: { fontSize: fp(8), fontWeight: typography.weight.black, color: colors.industry.text, letterSpacing: 1.5 },
  newsTldr: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 2, marginBottom: spacing.sm },
  newsText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(22) },
  newsTopicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  newsTopicLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted },
  newsTopicText: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.secondary, flex: 1 },
  questionText: { fontSize: fp(18), color: colors.text.primary, lineHeight: fp(28), fontWeight: typography.weight.bold, marginBottom: spacing.xl },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  diffLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const },
  dots: { flexDirection: 'row', gap: wp(3) },
  dot: { width: wp(6), height: wp(6), borderRadius: wp(3), backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent.primary },
  learnCard: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.borderLight, borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.lg },
  learnLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  learnHint: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginBottom: spacing.md },
  learnSectionLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(4), marginTop: spacing.sm },
  learnLinks: { gap: spacing.sm },
  learnLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: spacing.sm },
  learnLinkIcon: { fontSize: fp(12) },
  learnLinkText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold, flex: 1 },
  learnLinkArrow: { fontSize: fp(12), color: colors.text.muted },
  btnArea: { padding: layout.screenPadding, paddingTop: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.bg.primary },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
