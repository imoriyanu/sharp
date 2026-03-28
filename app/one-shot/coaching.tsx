import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { LoadingScreen, AudioWaveBars, PulseDot, FadeIn } from '../../src/components/Animations';
import { playQuestionAudio, stopAudio } from '../../src/services/tts';
import { transcribeAudio } from '../../src/services/transcription';
import { isPremium, canPracticeAgain, trackPracticeAgainUsage } from '../../src/services/premium';

type PracticeState = 'idle' | 'listening_model' | 'ready' | 'recording' | 'processing' | 'done';

export default function CoachingScreen() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const original = (p.original as string) || '';
  const problems = JSON.parse((p.problems as string) || '[]');
  const rewrite = (p.rewrite as string) || '';
  const explanation = (p.explanation as string) || '';

  const [practiceState, setPracticeState] = useState<PracticeState>('idle');
  const [userAttempt, setUserAttempt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [practiceRemaining, setPracticeRemaining] = useState<number | null>(null);
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    checkPractice();
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function checkPractice() {
    if (!isPremium()) { setPracticeRemaining(0); return; }
    const { limit, used } = await canPracticeAgain();
    if (mountedRef.current) setPracticeRemaining(limit - used);
  }

  async function startPractice() {
    if (!isPremium() || (practiceRemaining !== null && practiceRemaining <= 0)) {
      router.push('/premium');
      return;
    }
    await trackPracticeAgainUsage();
    setPracticeRemaining(prev => Math.max(0, (prev || 1) - 1));
    setPracticeState('listening_model');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await playQuestionAudio(rewrite);
    if (mountedRef.current) setPracticeState('ready');
  }

  async function startRecording() {
    try {
      await stopAudio();
      await requestRecordingPermissionsAsync();
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
      setPracticeState('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      __DEV__ && console.error('Recording error:', e);
      setPracticeState('ready');
    }
    // Note: if on a call, interruptionMode 'duckOthers' allows recording to coexist
  }

  async function stopRecording() {
    if (!recorderRef.current) return;
    setPracticeState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;
      recorderRef.current = null;
      if (!uri) throw new Error('No URI');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const { transcript } = await transcribeAudio(uri);
      setUserAttempt(transcript);

      // Compare and give feedback
      const similarity = compareSentences(rewrite, transcript);
      let fb = '';
      if (similarity > 0.8) {
        fb = "Nailed it. That's sharp, clear, and confident. You're ready to deliver this in the room.";
      } else if (similarity > 0.5) {
        fb = "Good attempt — you captured the core message. Try tightening the phrasing to match the model more closely. The specific numbers and structure matter.";
      } else {
        fb = "You drifted from the sharper version. Listen to the model again, focus on the structure: lead with the metric, then the impact. Try once more.";
      }
      if (!mountedRef.current) return;
      setFeedback(fb);
      setPracticeState('done');

      // Speak the feedback only if still on screen
      if (mountedRef.current) await playQuestionAudio(fb);
    } catch (e) {
      __DEV__ && console.error('Practice recording error:', e);
      if (mountedRef.current) setPracticeState('ready');
    }
  }

  async function listenToModel() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await playQuestionAudio(rewrite);
  }

  async function retryPractice() {
    if (!isPremium() || (practiceRemaining !== null && practiceRemaining <= 0)) {
      router.push('/premium');
      return;
    }
    await trackPracticeAgainUsage();
    setPracticeRemaining(prev => Math.max(0, (prev || 1) - 1));
    await stopAudio();
    setUserAttempt('');
    setFeedback('');
    setPracticeState('listening_model');
    await playQuestionAudio(rewrite);
    if (mountedRef.current) setPracticeState('ready');
  }

  if (practiceState === 'processing') {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message="Comparing your version..." submessage="Checking against the model" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Snippet Coaching</Text>
          <TouchableOpacity onPress={() => { stopAudio(); router.back(); }}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        <Text style={s.tag}>Your words</Text>
        <View style={s.snippetBad}><Text style={s.snippetBadText}>"{original}"</Text></View>

        <Text style={s.tag}>What's wrong</Text>
        <View style={s.card}>
          {problems.map((prob: string, i: number) => (
            <View key={i} style={s.prob}>
              <View style={s.probDot} />
              <Text style={s.probText}>{prob}</Text>
            </View>
          ))}
        </View>

        <Text style={s.tag}>Sharper version</Text>
        <TouchableOpacity style={s.snippetGood} onPress={listenToModel} activeOpacity={0.7}>
          <Text style={s.snippetGoodText}>"{rewrite}"</Text>
          <Text style={s.listenHint}>Tap to hear it spoken</Text>
        </TouchableOpacity>

        {explanation ? (
          <>
            <Text style={s.tag}>Why this is better</Text>
            <Text style={s.explanation}>{explanation}</Text>
          </>
        ) : null}

        {/* Practice section */}
        {practiceState === 'idle' && isPremium() && practiceRemaining !== null && practiceRemaining > 0 && (
          <TouchableOpacity style={s.mainBtn} onPress={startPractice} activeOpacity={0.8}>
            <Text style={s.mainBtnText}>🎤 Practice this sentence</Text>
            <Text style={s.mainBtnSub}>{practiceRemaining} practice{practiceRemaining !== 1 ? 's' : ''} remaining today</Text>
          </TouchableOpacity>
        )}
        {practiceState === 'idle' && isPremium() && practiceRemaining === 0 && (
          <View style={[s.mainBtn, s.mainBtnDisabled]}>
            <Text style={s.mainBtnText}>Practice limit reached</Text>
            <Text style={s.mainBtnSub}>Resets tomorrow</Text>
          </View>
        )}
        {practiceState === 'idle' && !isPremium() && (
          <TouchableOpacity style={[s.mainBtn, s.mainBtnLocked]} onPress={() => router.push('/premium')} activeOpacity={0.7}>
            <Text style={s.mainBtnText}>🔒 Practice this sentence</Text>
            <Text style={s.mainBtnSub}>Upgrade to Pro</Text>
          </TouchableOpacity>
        )}

        {practiceState === 'listening_model' && (
          <View style={s.practiceCard}>
            <Text style={s.practiceStatus}>🔊 Listen to the model...</Text>
            <AudioWaveBars active={true} color={colors.success} height={wp(36)} />
            <Text style={s.practiceHint}>You'll record your version next</Text>
          </View>
        )}

        {practiceState === 'ready' && (
          <TouchableOpacity style={s.recordBtn} onPress={startRecording} activeOpacity={0.8}>
            <Text style={s.recordBtnText}>🎤 Now say it yourself</Text>
          </TouchableOpacity>
        )}

        {practiceState === 'recording' && (
          <>
            <AudioWaveBars active={true} color={colors.recording} height={wp(40)} />
            <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
              <PulseDot size={wp(10)} />
              <Text style={s.stopBtnText}>Stop recording</Text>
            </TouchableOpacity>
          </>
        )}

        {practiceState === 'done' && (
          <>
            <FadeIn delay={0}>
              <View style={s.attemptCard}>
                <Text style={s.attemptLabel}>You said</Text>
                <Text style={s.attemptText}>"{userAttempt}"</Text>
              </View>
            </FadeIn>

            <FadeIn delay={200}>
              <View style={s.feedbackCard}>
                <Text style={s.feedbackText}>{feedback}</Text>
              </View>
            </FadeIn>

            {practiceRemaining !== null && practiceRemaining > 0 ? (
              <TouchableOpacity style={s.mainBtn} onPress={retryPractice} activeOpacity={0.8}>
                <Text style={s.mainBtnText}>↻ Try again</Text>
                <Text style={s.mainBtnSub}>{practiceRemaining} remaining</Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.mainBtn, s.mainBtnDisabled]}>
                <Text style={s.mainBtnText}>No practices remaining</Text>
                <Text style={s.mainBtnSub}>Resets tomorrow</Text>
              </View>
            )}
          </>
        )}

        {practiceState !== 'idle' && practiceState !== 'done' ? null : (
          <TouchableOpacity style={s.ghostBtn} onPress={() => { stopAudio(); router.back(); }} activeOpacity={0.7}>
            <Text style={s.ghostBtnText}>Back to results</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function compareSentences(model: string, attempt: string): number {
  const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const modelWords = normalize(model);
  const attemptWords = normalize(attempt);
  if (modelWords.length === 0 || attemptWords.length === 0) return 0;
  const modelSet = new Set(modelWords);
  const matches = attemptWords.filter(w => modelSet.has(w)).length;
  return matches / Math.max(modelWords.length, attemptWords.length);
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },
  tag: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: spacing.md, marginTop: spacing.lg },
  snippetBad: { backgroundColor: colors.feedback.negativeBg, borderLeftWidth: wp(3), borderLeftColor: colors.error, borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  snippetBadText: { fontSize: fp(12), color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(19) },
  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  prob: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(6), paddingVertical: wp(3) },
  probDot: { width: wp(5), height: wp(5), borderRadius: wp(3), backgroundColor: colors.error, marginTop: wp(5) },
  probText: { fontSize: fp(10), color: colors.text.secondary, lineHeight: fp(15), flex: 1 },
  snippetGood: { backgroundColor: colors.feedback.positiveBg, borderLeftWidth: wp(3), borderLeftColor: colors.success, borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  snippetGoodText: { fontSize: fp(12), color: colors.text.primary, fontWeight: typography.weight.bold, lineHeight: fp(19) },
  listenHint: { fontSize: fp(8), color: colors.success, fontWeight: typography.weight.semibold, marginTop: wp(4) },
  explanation: { fontSize: fp(10), color: colors.text.secondary, lineHeight: fp(16), marginBottom: spacing.xl },

  // Practice states
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.md, ...shadows.accent },
  mainBtnDisabled: { opacity: 0.4 },
  mainBtnLocked: { backgroundColor: colors.text.muted },
  mainBtnText: { fontSize: fp(12), fontWeight: typography.weight.bold, color: colors.text.inverse },
  mainBtnSub: { fontSize: fp(9), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },
  recordBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginTop: spacing.md, ...shadows.accent },
  recordBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  stopBtn: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, paddingVertical: wp(13), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), marginTop: spacing.md },
  stopDot: { width: wp(10), height: wp(10), borderRadius: wp(3), backgroundColor: colors.recording },
  stopBtnText: { fontSize: fp(12), fontWeight: typography.weight.bold, color: colors.recording },
  practiceCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', marginTop: spacing.md },
  practiceStatus: { fontSize: fp(12), fontWeight: typography.weight.bold, color: colors.text.primary },
  practiceHint: { fontSize: fp(10), color: colors.text.muted, marginTop: wp(4) },

  // Results
  attemptCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
  attemptLabel: { fontSize: fp(8), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: wp(4) },
  attemptText: { fontSize: fp(11), color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(18) },
  feedbackCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
  feedbackText: { fontSize: fp(11), color: colors.text.primary, lineHeight: fp(18), fontWeight: typography.weight.bold },

  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginTop: spacing.sm },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
