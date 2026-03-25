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
import { scoreAnswer } from '../../src/services/scoring';
import { getContext, saveSession, generateId, getAverageScores, getRecentInsights, clearOneShotQuestionCache, clearThreadedQuestionCache } from '../../src/services/storage';
import { trackOneShotUsage, trackThreadedUsage } from '../../src/services/premium';

const DEFAULT_TIMER = 90;

export default function RecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ question: string; mode: string; reasoning: string; timerSeconds: string }>();
  const TIMER_SECONDS = parseInt(params.timerSeconds || String(DEFAULT_TIMER)) || DEFAULT_TIMER;
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
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
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
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
    } catch (e) {
      console.error('Recording error:', e);
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

      const [ctx, prevScores, insights] = await Promise.all([getContext(), getAverageScores(), getRecentInsights()]);
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

      // Clear question cache (completed — next time get a new one)
      if (params.mode === 'threaded') await clearThreadedQuestionCache();
      else await clearOneShotQuestionCache();

      // Track usage
      if (params.mode === 'threaded') await trackThreadedUsage();
      else await trackOneShotUsage();

      router.replace({
        pathname: '/one-shot/results',
        params: {
          scores: JSON.stringify(result.scores),
          overall: String(result.overall),
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
          question: params.question || '',
          reasoning: params.reasoning || '',
          transcript,
          recordingUri: uri,
          mode: params.mode || 'one_shot',
        },
      });
    } catch (e) {
      console.error('Processing error:', e);
      setProcessing(false);
    }
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (processing) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message="Scoring your answer..." submessage="Analysing structure, substance, concision..." />
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
