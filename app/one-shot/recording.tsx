import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, PulseDot, FadeIn } from '../../src/components/Animations';
import { stopAudio } from '../../src/services/tts';
import { transcribeAudio } from '../../src/services/transcription';
import { scoreAnswer, generateFollowUp, generateDebrief, computeProgressScore } from '../../src/services/scoring';
import { getContext, saveSession, generateId, getAverageScores, getRecentInsights, clearOneShotQuestionCache, clearThreadedQuestionCache, clearIndustryQuestionCache, getThreadState, saveThreadState, clearThreadState, getSessions, getSessionById } from '../../src/services/storage';
import { trackOneShotUsage, trackThreadedUsage } from '../../src/services/premium';

const DEFAULT_TIMER = 90;

export default function RecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ question: string; mode: string; reasoning: string; timerSeconds: string }>();
  const TIMER_SECONDS = parseInt(params.timerSeconds || String(DEFAULT_TIMER)) || DEFAULT_TIMER;
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('Scoring your answer...');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [retryReason, setRetryReason] = useState('');
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    startRecording();
    return () => {
      mountedRef.current = false;
      stopAudio();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    try {
      await stopAudio();
      await requestRecordingPermissionsAsync();

      // Try configuring audio session — fallback through modes if one fails
      let sessionReady = false;
      for (const mode of ['duckOthers', 'mixWithOthers'] as const) {
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: mode });
          sessionReady = true;
          break;
        } catch { /* try next mode */ }
      }
      if (!sessionReady) {
        // Last resort — basic config
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }

      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recorderRef.current = recorder;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { stopRecording(); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      __DEV__ && console.error('Recording error:', e);
      const msg = e?.message || '';
      if (msg.includes('call') || msg.includes('interruption') || msg.includes('session')) {
        setRetryReason('Microphone is being used by another app (call or FaceTime). End the call and try again.');
      } else {
        setRetryReason('Could not start recording. Please check your microphone permissions and try again.');
      }
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!recorderRef.current) return;
    setIsRecording(false);
    setProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;
      recorderRef.current = null;
      if (!uri) throw new Error('No URI');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const { transcript } = await transcribeAudio(uri);
      setLiveTranscript(transcript);

      // Validate transcript — catch empty, too short, or nonsensical responses
      const trimmed = transcript.trim();
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

      if (!trimmed || wordCount < 5) {
        setRetryReason(wordCount === 0
          ? "I didn't catch anything. Make sure your microphone is working and speak clearly."
          : "That was too short to analyse properly. Try giving a fuller response — aim for at least a few sentences.");
        setProcessing(false);
        return;
      }

      const ctx = await getContext();

      // ===== THREADED MODE: skip scoring, go directly to follow-up or debrief =====
      if (params.mode === 'threaded') {
        const thread = await getThreadState();
        if (!thread) throw new Error('No active thread');

        // Add this turn
        const turnNumber = thread.turns.length + 1;
        thread.turns.push({ turnNumber, question: params.question || '', transcript });
        await saveThreadState(thread);

        const MAX_TURNS = 4;

        if (turnNumber >= MAX_TURNS) {
          // Final turn — generate debrief
          setProcessingMsg('Analysing the full exchange...');
          await trackThreadedUsage();
          await clearThreadedQuestionCache();

          const debrief = await generateDebrief({
            roleText: ctx?.roleText || '',
            currentCompany: ctx?.currentCompany || '',
            situationText: ctx?.situationText || '',
            dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
            turns: thread.turns.map(t => ({ turn: t.turnNumber, question: t.question, transcript: t.transcript, scores: {} })),
          });

          if (!mountedRef.current) return;

          // Save as session
          await saveSession({
            id: generateId(), type: 'threaded', scenario: thread.originalQuestion.slice(0, 50),
            turns: thread.turns.map(t => ({
              id: generateId(), turnNumber: t.turnNumber, question: t.question,
              questionReasoning: '', questionTargets: 'substance' as const, questionDifficulty: 5,
              transcript: t.transcript, scores: { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 },
              overall: debrief.overall, summary: '', coachingInsight: debrief.summary,
              awarenessNote: null, snippet: { original: '', problems: [], rewrite: '', explanation: '' },
            })),
            createdAt: thread.startedAt,
          });

          await clearThreadState();

          router.replace({
            pathname: '/threaded/debrief',
            params: {
              debrief: JSON.stringify(debrief),
              turns: JSON.stringify(thread.turns),
            },
          });
        } else {
          // Not final — generate follow-up
          setProcessingMsg('Sharp is thinking about your response...');

          const followUp = await generateFollowUp({
            roleText: ctx?.roleText || '',
            currentCompany: ctx?.currentCompany || '',
            situationText: ctx?.situationText || '',
            dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
            originalQuestion: thread.originalQuestion,
            previousTranscripts: thread.turns.map(t => ({ turn: t.turnNumber, question: t.question, transcript: t.transcript, scores: {} })),
            turnNumber: turnNumber + 1,
          });

          if (!mountedRef.current) return;

          router.replace({
            pathname: '/threaded/follow-up',
            params: {
              reaction: followUp.reaction || '',
              question: followUp.followUp,
              targeting: followUp.targeting,
              pressureLevel: followUp.pressureLevel || 'probing',
              turnNumber: String(turnNumber + 1),
              turns: JSON.stringify(thread.turns),
            },
          });
        }
        return;
      }

      // ===== ONE-SHOT MODE: score and show results =====
      const [prevScores, insights, sessions] = await Promise.all([getAverageScores(), getRecentInsights(), getSessions()]);
      const result = await scoreAnswer({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        question: params.question || '',
        transcript,
        previousScores: prevScores || undefined,
        recentInsights: insights,
      });

      if (!mountedRef.current) return;

      // Compute progress score from history
      const recentScores: number[] = [];
      for (const s of sessions.slice(0, 5)) {
        const full = await getSessionById(s.id);
        if (full?.turns.length) recentScores.push(full.turns[full.turns.length - 1].overall);
      }
      const progressScore = computeProgressScore({
        rawOverall: result.overall,
        historicalAverage: prevScores?.overall ?? null,
        sessionCount: sessions.length,
        recentScores,
      });

      await Promise.all([clearOneShotQuestionCache(), clearIndustryQuestionCache()]);
      await trackOneShotUsage();

      router.replace({
        pathname: '/one-shot/results',
        params: {
          scores: JSON.stringify(result.scores),
          overall: String(result.overall),
          progressScore: String(progressScore.progress),
          progressDelta: String(progressScore.delta),
          progressTrend: progressScore.trend,
          progressMessage: progressScore.message,
          summary: result.summary,
          positives: result.positives || '',
          improvements: result.improvements || '',
          coachingInsight: result.coachingInsight,
          awarenessNote: result.awarenessNote || '',
          fillerWordsFound: JSON.stringify(result.fillerWordsFound),
          fillerCount: String(result.fillerCount),
          snippetOriginal: result.weakestSnippet.original,
          snippetProblems: JSON.stringify(result.weakestSnippet.problems),
          snippetRewrite: result.weakestSnippet.rewrite,
          snippetExplanation: result.weakestSnippet.explanation,
          modelAnswer: result.modelAnswer || '',
          communicationTip: result.communicationTip || '',
          suggestedAngles: JSON.stringify(result.suggestedAngles || []),
          suggestedReading: result.suggestedReading ? JSON.stringify(result.suggestedReading) : '',
          question: params.question || '',
          reasoning: params.reasoning || '',
          transcript,
          recordingUri: uri,
          mode: 'one_shot',
        },
      });
    } catch (e) {
      __DEV__ && console.error('Processing error:', e);
      setProcessing(false);
      setRetryReason('Something went wrong while scoring your answer. Please try again.');
    }
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (processing) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message={processingMsg} submessage={params.mode === 'threaded' ? 'Building the conversation...' : 'Analysing structure, substance, concision...'} />
      </SafeAreaView>
    );
  }

  if (retryReason) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.retryContainer}>
          <Text style={s.retryEmoji}>🎤</Text>
          <Text style={s.retryTitle}>Let's try that again</Text>
          <Text style={s.retryReason}>{retryReason}</Text>
          {liveTranscript ? (
            <View style={s.retryTranscript}>
              <Text style={s.retryTranscriptLabel}>What I heard:</Text>
              <Text style={s.retryTranscriptText}>"{liveTranscript}"</Text>
            </View>
          ) : null}
          <View style={s.retryTips}>
            <Text style={s.retryTipTitle}>Tips for a good response</Text>
            <Text style={s.retryTip}>• Speak for at least 15-20 seconds</Text>
            <Text style={s.retryTip}>• Start with your main point, then support it</Text>
            <Text style={s.retryTip}>• Use specific examples where possible</Text>
          </View>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setRetryReason(''); setLiveTranscript(''); setTimeLeft(TIMER_SECONDS); startRecording(); }} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>🎤 Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.retryGhost} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.retryGhostText}>Back to question</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <FadeIn>
          <Text style={s.questionRef} numberOfLines={2}>"{params.question}"</Text>
        </FadeIn>

        <View style={s.center}>
          <Text style={s.timer}>{timerStr}</Text>

          {isRecording && (
            <AudioWaveBars active={isRecording} color={colors.recording} height={wp(44)} />
          )}

          {isRecording && (
            <View style={s.recBadge}><PulseDot /><Text style={s.recText}>Recording</Text></View>
          )}

          {liveTranscript ? (
            <View style={s.tbox}><Text style={s.ttext}>"{liveTranscript.slice(0, 200)}{liveTranscript.length > 200 ? '...' : ''}"</Text></View>
          ) : isRecording ? (
            <View style={s.tbox}><Text style={s.tplaceholder}>Speak clearly...</Text></View>
          ) : null}
        </View>

        <View style={s.spacer} />

        {isRecording && (
          <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
            <View style={s.stopSq} /><Text style={s.stopText}>Stop recording</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  questionRef: { fontSize: typography.size.sm, color: colors.text.muted, lineHeight: fp(16), paddingBottom: spacing.md, borderBottomWidth: 1.5, borderBottomColor: colors.borderLight, marginBottom: spacing.xxl },
  center: { alignItems: 'center' },
  timer: { fontSize: fp(64), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -3, marginBottom: spacing.sm },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: wp(5), backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(4), marginBottom: spacing.xl },
  recDot: { width: wp(7), height: wp(7), borderRadius: wp(4), backgroundColor: colors.recording },
  recText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.recording, textTransform: 'uppercase' as const },
  procText: { fontSize: typography.size.sm, color: colors.text.tertiary, marginBottom: spacing.xl },
  tbox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, width: '100%', minHeight: wp(50), marginTop: spacing.lg },
  ttext: { fontSize: typography.size.sm, color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(18) },
  tplaceholder: { fontSize: typography.size.sm, color: colors.text.muted, fontStyle: 'italic' },
  spacer: { flex: 1 },
  stopBtn: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, paddingVertical: wp(15), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6) },
  stopSq: { width: wp(11), height: wp(11), borderRadius: wp(3), backgroundColor: colors.recording },
  stopText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.recording },

  // Retry state
  retryContainer: { flex: 1, padding: layout.screenPadding, alignItems: 'center', justifyContent: 'center' },
  retryEmoji: { fontSize: fp(36), marginBottom: spacing.lg },
  retryTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  retryReason: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), marginBottom: spacing.xl, paddingHorizontal: spacing.lg },
  retryTranscript: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.lg, width: '100%', marginBottom: spacing.xl },
  retryTranscriptLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  retryTranscriptText: { fontSize: typography.size.sm, color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(20) },
  retryTips: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, width: '100%', marginBottom: spacing.xxl, ...shadows.sm },
  retryTipTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.md },
  retryTip: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(20) },
  retryBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center', ...shadows.accent },
  retryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  retryGhost: { paddingVertical: spacing.lg },
  retryGhostText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
