import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, PulseDot, FadeIn } from '../../src/components/Animations';
import { stopAudio, playQuestionAudio, buildNaturalScript } from '../../src/services/tts';
import { generateQuestion } from '../../src/services/scoring';
import { transcribeAudio } from '../../src/services/transcription';
import { scoreAnswer } from '../../src/services/scoring';
import { getContext, saveDailyResult, updateStreak, saveSession, generateId, getCachedDailyQuestion, cacheDailyQuestion, clearDailyQuestionCache, getRecentQuestions, addRecentQuestion, getAverageScores, getRecentInsights, getRecentSessionHistory } from '../../src/services/storage';
import { trackEvent, Events } from '../../src/services/analytics';
import type { RecordingState, GeneratedQuestion } from '../../src/types';

const DEFAULT_TIMER = 60;

export default function DailyChallengeScreen() {
  const router = useRouter();
  const [q, setQ] = useState<GeneratedQuestion | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [timerMax, setTimerMax] = useState(DEFAULT_TIMER);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIMER);
  const [transcript, setTranscript] = useState('');
  const [retryReason, setRetryReason] = useState('');
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadQuestion();
    return () => {
      mountedRef.current = false;
      stopAudio();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function loadQuestion() {
    try {
      // Check cache first — don't burn API credits
      const cached = await getCachedDailyQuestion();
      if (cached) {
        const t = cached.question.timerSeconds || DEFAULT_TIMER;
        if (!mountedRef.current) return;
        setQ(cached.question);
        setTimerMax(t);
        setTimeLeft(t);
        setState('ready');
        setSpeaking(true);
        await playQuestionAudio(buildNaturalScript(cached.question));
        if (mountedRef.current) setSpeaking(false);
        return;
      }

      const [ctx, recentQuestions, sessionHistory, averageScores] = await Promise.all([
        getContext(), getRecentQuestions(), getRecentSessionHistory(), getAverageScores(),
      ]);
      const result = await generateQuestion({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        documents: ctx?.documents || [],
        recentQuestions,
        sessionHistory,
        averageScores: averageScores || undefined,
      });

      // Cache for the day and track for variety
      await cacheDailyQuestion(result);
      await addRecentQuestion(result.question);

      const t = result.timerSeconds || DEFAULT_TIMER;
      if (!mountedRef.current) return;
      setQ(result);
      setTimerMax(t);
      setTimeLeft(t);
      setState('ready');
      setSpeaking(true);
      await playQuestionAudio(buildNaturalScript(result));
      if (mountedRef.current) setSpeaking(false);
    } catch (e) {
      if (!mountedRef.current) return;
      const fallback: GeneratedQuestion = { question: "What's the hardest decision you've made this month, and what did you learn?", format: 'prompt', timerSeconds: 60, reasoning: '', targets: 'substance', difficulty: 5, contextUsed: [] };
      setQ(fallback);
      setState('ready');
      setSpeaking(true);
      await playQuestionAudio(buildNaturalScript(fallback));
      setSpeaking(false);
    }
  }

  async function startRecording() {
    try {
      await stopAudio();
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return;
      // Try configuring audio session with fallback modes
      let sessionReady = false;
      for (const mode of ['duckOthers', 'mixWithOthers'] as const) {
        try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: mode }); sessionReady = true; break; } catch { /* try next */ }
      }
      if (!sessionReady) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recorderRef.current = recorder;
      setState('recording');
      trackEvent(Events.DAILY_CHALLENGE_STARTED);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setTimeLeft(timerMax);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { stopRecording(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      __DEV__ && console.error('Failed to start recording:', e);
      setRetryReason('Could not start recording. If you\'re on a call, end it first and try again.');
      setState('ready');
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!recorderRef.current) return;

    setState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;
      recorderRef.current = null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      if (!uri) throw new Error('No recording URI');

      const { transcript: text } = await transcribeAudio(uri);
      setTranscript(text);

      // Validate — catch empty or too-short responses
      const trimmed = text.trim();
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (!trimmed || wordCount < 5) {
        setRetryReason(wordCount === 0
          ? "I didn't catch anything. Check your microphone and try again."
          : "That was too short to score. Try giving a fuller answer — a few sentences at least.");
        setState('ready');
        return;
      }

      const [ctx, prevScores, insights] = await Promise.all([getContext(), getAverageScores(), getRecentInsights()]);
      const result = await scoreAnswer({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        question: q?.question || '',
        transcript: text,
        previousScores: prevScores || undefined,
        recentInsights: insights,
      });

      const today = new Date().toISOString().split('T')[0];
      await saveDailyResult({ score: result.overall, insight: result.coachingInsight, date: today, transcript: text });
      trackEvent(Events.DAILY_CHALLENGE_COMPLETED, { score: result.overall });
      await clearDailyQuestionCache();
      const streakResult = await updateStreak();
      await saveSession({
        id: generateId(), type: 'daily_30', scenario: (q?.question || '').slice(0, 50),
        turns: [{ id: generateId(), turnNumber: 1, question: q?.question || '', questionReasoning: '', questionTargets: 'concision', questionDifficulty: 5, transcript: text, recordingUri: uri, scores: result.scores, overall: result.overall, summary: result.summary, coachingInsight: result.coachingInsight, awarenessNote: result.awarenessNote, snippet: result.weakestSnippet }],
        createdAt: new Date().toISOString(),
      });

      router.replace({
        pathname: '/daily/result',
        params: {
          score: String(result.overall),
          insight: result.coachingInsight,
          question: q?.question || '',
          communicationTip: result.communicationTip || '',
          suggestedAngles: JSON.stringify(result.suggestedAngles || []),
          summary: result.summary,
          newBadge: streakResult.newBadge ? JSON.stringify(streakResult.newBadge) : '',
        },
      });
    } catch (e) {
      __DEV__ && console.error('Processing error:', e);
      setRetryReason('Something went wrong while scoring your answer. Please try again.');
      setState('ready');
    }
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const format = q?.format || 'prompt';
  const formatLabel = format === 'roleplay' ? 'Role Play' : format === 'briefing' ? 'Briefing' : format === 'pressure' ? 'Pressure' : format === 'context' ? 'Your Context' : 'Quick Prompt';

  if (state === 'idle') {
    return (
      <SafeAreaView style={st.safe}>
        <LoadingScreen message="Crafting your challenge..." submessage="Generating something interesting" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.container}>
        <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={st.topRow}>
            <View style={st.badge}><Text style={st.badgeText}>Daily Challenge</Text></View>
            <View style={st.formatBadge}><Text style={st.formatText}>{formatLabel}</Text></View>
          </View>

          {/* Context cards for roleplay/briefing/pressure */}
          {(format === 'roleplay' || format === 'pressure') && q?.situation && (
            <FadeIn delay={200}>
              <View style={st.contextCard}>
                <Text style={st.contextLabel}>The situation</Text>
                <Text style={st.contextText}>{q.situation}</Text>
              </View>
            </FadeIn>
          )}

          {format === 'briefing' && q?.background && (
            <FadeIn delay={200}>
              <View style={st.contextCard}>
                <Text style={st.contextLabel}>Background</Text>
                <Text style={st.contextText}>{q.background}</Text>
              </View>
            </FadeIn>
          )}

          <FadeIn delay={100}>
            <Text style={st.question}>{q?.question || 'Loading your challenge...'}</Text>
          </FadeIn>

          {/* TTS playback wave */}
          {speaking && (
            <View style={st.speakingRow}>
              <AudioWaveBars active={true} color={colors.accent.primary} height={wp(32)} barCount={20} />
              <Text style={st.speakingText}>Sharp is speaking...</Text>
            </View>
          )}

          {/* Timer */}
          <Text style={[st.timer, state === 'recording' && st.timerActive]}>
            {state === 'processing' ? '...' : timerStr}
          </Text>

          {state === 'recording' && (
            <AudioWaveBars active={state === 'recording'} color={colors.recording} height={wp(40)} />
          )}

          {state === 'recording' && (
            <View style={st.recBadge}><PulseDot /><Text style={st.recText}>Recording</Text></View>
          )}

          {state === 'processing' && (
            <Text style={st.processingText}>Analysing your response...</Text>
          )}

          {transcript ? (
            <View style={st.transcriptBox}><Text style={st.transcriptText}>"{transcript.slice(0, 200)}..."</Text></View>
          ) : state === 'recording' ? (
            <View style={st.transcriptBox}><Text style={st.transcriptPlaceholder}>Speak clearly...</Text></View>
          ) : null}
        </ScrollView>

        {retryReason ? (
          <View style={st.retryBanner}>
            <Text style={st.retryEmoji}>🔄</Text>
            <Text style={st.retryText}>{retryReason}</Text>
          </View>
        ) : null}

        <View style={st.btnArea}>
          {state === 'ready' && !speaking && (
            <>
              <TouchableOpacity style={st.btnReplay} onPress={async () => {
                if (q) { setSpeaking(true); await playQuestionAudio(buildNaturalScript(q)); setSpeaking(false); }
              }} activeOpacity={0.7}>
                <Text style={st.btnReplayText}>🔊 Replay question</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnMain} onPress={() => { setRetryReason(''); setTranscript(''); setTimeLeft(timerMax); startRecording(); }} activeOpacity={0.8}>
                <Text style={st.btnMainText}>{retryReason ? '🎤 Try again' : `🎤 Start recording · ${timerMax}s`}</Text>
              </TouchableOpacity>
            </>
          )}
          {speaking && (
            <TouchableOpacity style={st.btnSkip} onPress={() => { stopAudio(); setSpeaking(false); }} activeOpacity={0.7}>
              <Text style={st.btnSkipText}>Skip →</Text>
            </TouchableOpacity>
          )}
          {state === 'recording' && (
            <TouchableOpacity style={st.btnStop} onPress={stopRecording} activeOpacity={0.8}>
              <View style={st.stopSquare} /><Text style={st.btnStopText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1 },
  scrollContent: { padding: layout.screenPadding, paddingTop: wp(30), paddingBottom: wp(20) },

  topRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, alignItems: 'center' },
  badge: { backgroundColor: colors.daily.bg, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5) },
  badgeText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.daily.text },
  formatBadge: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(4) },
  formatText: { fontSize: fp(9), fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  contextCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
  contextLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  contextText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  question: { fontSize: typography.size.lg, color: colors.text.primary, lineHeight: fp(28), fontWeight: typography.weight.bold, marginBottom: spacing.xxl },

  timer: { fontSize: typography.size.timer, fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -2, textAlign: 'center', marginBottom: spacing.sm },
  timerActive: { color: colors.accent.primary },

  recBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(5), backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'center', marginBottom: spacing.lg },
  recDot: { width: wp(7), height: wp(7), borderRadius: wp(4), backgroundColor: colors.recording },
  recText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.recording, textTransform: 'uppercase' as const },

  processingText: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', marginBottom: spacing.lg },

  transcriptBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.lg, width: '100%', minHeight: wp(60) },
  transcriptText: { fontSize: typography.size.sm, color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(20) },
  transcriptPlaceholder: { fontSize: typography.size.sm, color: colors.text.muted, fontStyle: 'italic' },

  speakingRow: { alignItems: 'center', marginBottom: spacing.lg },
  speakingText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold, marginTop: spacing.sm },

  btnArea: { padding: layout.screenPadding, paddingBottom: wp(10), gap: spacing.sm },
  btnMain: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), width: '100%', alignItems: 'center', ...shadows.accent },
  btnMainText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  btnReplay: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(12), width: '100%', alignItems: 'center' },
  btnReplayText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  btnSkip: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: wp(13), width: '100%', alignItems: 'center' },
  btnSkipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  btnStop: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6) },
  stopSquare: { width: wp(11), height: wp(11), borderRadius: wp(3), backgroundColor: colors.recording },
  btnStopText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.recording },

  retryBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: layout.screenPadding },
  retryEmoji: { fontSize: fp(18) },
  retryText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), flex: 1 },
});
