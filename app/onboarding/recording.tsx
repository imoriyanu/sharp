import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, PulseDot, FadeIn } from '../../src/components/Animations';
import { SharpFox, ProgressDots } from '../../src/components/Illustrations';
import { stopAudio } from '../../src/services/tts';
import { transcribeAudio } from '../../src/services/transcription';
import { scoreAnswer } from '../../src/services/scoring';
import { saveSession, generateId, setOnboardingStep } from '../../src/services/storage';

const TIMER = 30;
const QUESTION = 'Tell me about yourself — who are you and what you do?';

export default function OnboardingRecording() {
  const router = useRouter();
  const [state, setState] = useState<'ready' | 'recording' | 'processing'>('ready');
  const [timeLeft, setTimeLeft] = useState(TIMER);
  const [retryMsg, setRetryMsg] = useState('');
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopAudio(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function startRecording() {
    try {
      setRetryMsg('');
      await stopAudio();
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setRetryMsg('Microphone permission denied. Please enable it in Settings to use Sharp.');
        return;
      }
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeLeft(TIMER);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => { if (prev <= 1) { stopRecording(); return 0; } return prev - 1; });
      }, 1000);
    } catch (e: any) { __DEV__ && console.error('Recording error:', e); setRetryMsg('Could not start recording. If you\'re on a call, end it first.'); }
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
      if (!uri) throw new Error('No URI');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const { transcript } = await transcribeAudio(uri);
      if (!mountedRef.current) return;
      const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 5) {
        setRetryMsg("That was a bit quick! Give yourself the full 30 seconds — there's no pressure.");
        setState('ready'); setTimeLeft(TIMER); return;
      }
      const result = await scoreAnswer({ roleText: '', currentCompany: '', situationText: '', dreamRoleAndCompany: '', question: QUESTION, transcript, isOnboarding: true } as any);
      if (!mountedRef.current) return;
      await saveSession({ id: generateId(), type: 'one_shot', scenario: 'First impression', turns: [{ id: generateId(), turnNumber: 1, question: QUESTION, questionReasoning: '', questionTargets: 'substance', questionDifficulty: 3, transcript, recordingUri: uri, modelAnswer: result.modelAnswer || '', scores: result.scores, overall: result.overall, summary: result.summary, coachingInsight: result.coachingInsight, awarenessNote: result.awarenessNote, snippet: result.weakestSnippet }], createdAt: new Date().toISOString() });
      await setOnboardingStep(3);
      router.replace({ pathname: '/onboarding/result', params: { scores: JSON.stringify(result.scores), overall: String(result.overall), positives: result.positives || '', improvements: result.improvements || '', coachingInsight: result.coachingInsight, communicationTip: result.communicationTip || '', modelAnswer: result.modelAnswer || '' } });
    } catch (e) {
      __DEV__ && console.error('Processing error:', e);
      if (mountedRef.current) { setState('ready'); setRetryMsg('Something went wrong — please try again.'); }
    }
  }

  if (state === 'processing') {
    return <SafeAreaView style={s.safe}><LoadingScreen message="Sharp is listening..." submessage="Analysing your communication style" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <FadeIn><ProgressDots total={4} current={2} /></FadeIn>

        <View style={s.center}>
          <FadeIn delay={200}>
            <View style={s.questionCard}>
              <Text style={s.questionLabel}>YOUR CHALLENGE</Text>
              <Text style={s.questionText}>{QUESTION}</Text>
            </View>
          </FadeIn>

          <FadeIn delay={400}>
            <Text style={[s.timer, state === 'recording' && s.timerActive]}>
              0:{timeLeft.toString().padStart(2, '0')}
            </Text>
          </FadeIn>

          {state === 'recording' && (
            <FadeIn delay={0}>
              <View style={s.waveSection}>
                <AudioWaveBars active={true} color={colors.accent.primary} height={wp(50)} barCount={28} />
                <View style={s.recIndicator}>
                  <PulseDot size={wp(8)} />
                  <Text style={s.recText}>RECORDING</Text>
                </View>
              </View>
            </FadeIn>
          )}

          {state === 'ready' && !retryMsg && (
            <FadeIn delay={600}>
              <SharpFox size={wp(90)} expression="listening" />
            </FadeIn>
          )}

          {retryMsg && (
            <FadeIn>
              <View style={s.retryCard}>
                <SharpFox size={wp(70)} expression="thinking" />
                <Text style={s.retryText}>{retryMsg}</Text>
              </View>
            </FadeIn>
          )}
        </View>

        <View style={s.btnArea}>
          {state === 'ready' && (
            <FadeIn delay={800}>
              <TouchableOpacity style={s.cta} onPress={startRecording} activeOpacity={0.8}>
                <Text style={s.ctaText}>{retryMsg ? '🎤 Try again' : '🎤 Start recording'}</Text>
              </TouchableOpacity>
            </FadeIn>
          )}
          {state === 'recording' && (
            <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
              <View style={s.stopSq} /><Text style={s.stopText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, justifyContent: 'space-between', paddingTop: wp(16) },
  center: { alignItems: 'center', gap: spacing.lg },
  questionCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', ...shadows.md },
  questionLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, marginBottom: spacing.sm },
  questionText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary, lineHeight: fp(24) },
  timer: { fontSize: fp(52), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -2 },
  timerActive: { color: colors.accent.primary },
  waveSection: { alignItems: 'center', gap: spacing.md },
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: wp(6) },
  recText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.recording, letterSpacing: 1.5 },
  retryCard: { alignItems: 'center', gap: spacing.md, backgroundColor: colors.daily.bg, borderRadius: radius.xl, padding: spacing.xl },
  retryText: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20) },
  btnArea: { marginBottom: wp(16) },
  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  stopBtn: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, paddingVertical: wp(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6) },
  stopSq: { width: wp(12), height: wp(12), borderRadius: wp(3), backgroundColor: colors.recording },
  stopText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.recording },
});
