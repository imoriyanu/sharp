// @ts-nocheck — feature disabled for MVP; references symbols not yet wired in. See src/constants/features.ts.
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { AudioWaveBars, PulseDot, FadeIn, LoadingScreen } from '../../src/components/Animations';
import { apiGet, apiPost } from '../../src/services/api';
import { scoreAnswer } from '../../src/services/scoring';
import { getContext, saveSession, generateId, getAverageScores, getRecentInsights } from '../../src/services/storage';
import { trackRealtimeCoachingUsage } from '../../src/services/premium';
import { trackEvent, Events } from '../../src/services/analytics';
import type { RealtimeIntervention } from '../../src/types';

// @ts-ignore
const coachingHtml = require('../../assets/realtime-coaching.html');

type Mode = 'loading' | 'ready' | 'recording' | 'processing' | 'error';

const ISSUE_LABELS: Record<string, string> = {
  buried_point: 'Lead with your point',
  excessive_hedging: 'Stop hedging',
  filler_burst: 'Filler words',
  tangent: 'Stay on topic',
  rambling: 'Wrap it up',
  no_substance: 'Be specific',
};

export default function RealtimeCoachingLive() {
  const router = useRouter();
  const params = useLocalSearchParams<{ question: string; reasoning: string; timerSeconds: string }>();
  const TIMER_MAX = parseInt(params.timerSeconds || '120') || 120;

  const [mode, setMode] = useState<Mode>('loading');
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [interventions, setInterventions] = useState<RealtimeIntervention[]>([]);
  const [activeIntervention, setActiveIntervention] = useState<RealtimeIntervention | null>(null);
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [processingMsg, setProcessingMsg] = useState('Scoring your answer...');

  const webviewRef = useRef<WebView>(null);
  const webviewReady = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const evaluatingRef = useRef(false);
  const interventionsRef = useRef<RealtimeIntervention[]>([]);
  const elapsedRef = useRef(0);
  const fullTranscriptRef = useRef('');
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Sync refs with state
  useEffect(() => { interventionsRef.current = interventions; }, [interventions]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Fetch Deepgram key on mount
  useEffect(() => {
    mounted.current = true;
    fetchKey();
    return () => {
      mounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
    };
  }, []);

  async function fetchKey() {
    try {
      const data: any = await apiGet('/realtime-coaching/deepgram-key');
      if (!mounted.current) return;
      setDeepgramKey(data.key);
      setMode('ready');
    } catch {
      if (!mounted.current) return;
      setMode('error');
      setErrorMsg('Could not connect to coaching service. Make sure the backend is running with DEEPGRAM_API_KEY set.');
    }
  }

  function startRecording() {
    if (!webviewReady.current || !deepgramKey) return;
    webviewRef.current?.injectJavaScript(`
      handler({ data: JSON.stringify({ type: 'start', deepgramKey: '${deepgramKey}' }) });
      true;
    `);
    setMode('recording');
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= TIMER_MAX) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    trackEvent(Events.RECORDING_STARTED, { mode: 'realtime_coaching' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    webviewRef.current?.injectJavaScript(`
      handler({ data: JSON.stringify({ type: 'stop' }) });
      true;
    `);
    setMode('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Wait for final transcript from WebView, then score
    setTimeout(() => processResults(), 1000);
  }

  async function processResults() {
    try {
      const transcript = fullTranscriptRef.current.trim();
      if (!transcript || transcript.split(/\s+/).length < 5) {
        if (!mounted.current) return;
        setMode('error');
        setErrorMsg("I didn't catch enough to score. Try speaking more clearly or for longer.");
        return;
      }

      if (mounted.current) setProcessingMsg('Scoring your answer...');
      const ctx = await getContext();
      const documentExtractions = (ctx?.documents || []).map(d => d.structuredExtraction).filter(Boolean);
      const [prevScores, insights] = await Promise.all([getAverageScores(), getRecentInsights()]);

      const result = await scoreAnswer({
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        notes: ctx?.notes || '',
        documentExtractions,
        question: params.question || '',
        transcript,
        previousScores: prevScores || undefined,
        recentInsights: insights,
      });

      await trackRealtimeCoachingUsage();
      trackEvent(Events.SESSION_COMPLETED, { mode: 'realtime_coaching', score: result.overall });

      // Save session
      await saveSession({
        id: generateId(),
        type: 'realtime_coaching',
        scenario: (params.question || '').slice(0, 50),
        turns: [{
          id: generateId(),
          turnNumber: 1,
          question: params.question || '',
          questionReasoning: params.reasoning || '',
          questionTargets: 'substance' as const,
          questionDifficulty: 7,
          transcript,
          scores: result.scores,
          overall: result.overall,
          summary: result.summary,
          coachingInsight: result.coachingInsight,
          awarenessNote: result.awarenessNote,
          snippet: result.weakestSnippet,
          positives: result.positives,
          improvements: result.improvements,
          communicationTip: result.communicationTip,
          fillerWordsFound: result.fillerWordsFound,
          fillerCount: result.fillerCount,
        }],
        createdAt: new Date().toISOString(),
      });

      if (!mounted.current) return;

      router.replace({
        pathname: '/realtime-coaching/results',
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
          question: params.question || '',
          transcript,
          modelAnswer: result.modelAnswer || '',
          communicationTip: result.communicationTip || '',
          snippetOriginal: result.weakestSnippet.original,
          snippetProblems: JSON.stringify(result.weakestSnippet.problems),
          snippetRewrite: result.weakestSnippet.rewrite,
          snippetExplanation: result.weakestSnippet.explanation,
          interventions: JSON.stringify(interventionsRef.current),
          totalDuration: String(elapsedRef.current),
          mode: 'realtime_coaching',
        },
      });
    } catch (e: any) {
      __DEV__ && console.error('Processing error:', e);
      if (!mounted.current) return;
      setMode('error');
      setErrorMsg('Something went wrong scoring your answer. Please try again.');
    }
  }

  // Handle WebView messages
  const onMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'ready') {
        webviewReady.current = true;
      } else if (msg.type === 'status') {
        if (msg.status === 'error' || msg.status === 'disconnected') {
          // Only error if we're still recording
          if (mode === 'recording' && msg.status === 'error') {
            setErrorMsg('Lost connection to speech service.');
          }
        }
      } else if (msg.type === 'transcript_update') {
        fullTranscriptRef.current = msg.text || '';
        setLiveText(msg.text || '');
        setInterimText(msg.interim || '');
        scrollRef.current?.scrollToEnd({ animated: true });
      } else if (msg.type === 'sentence') {
        fullTranscriptRef.current = msg.fullTranscript || '';
        evaluateSentence(msg.text, msg.fullTranscript, msg.elapsedMs);
      } else if (msg.type === 'final_transcript') {
        fullTranscriptRef.current = msg.transcript || '';
      } else if (msg.type === 'error') {
        __DEV__ && console.warn('WebView error:', msg.message);
      }
    } catch {}
  }, [mode]);

  async function evaluateSentence(recentChunk: string, fullTranscript: string, elapsedMs: number) {
    const currentInterventions = interventionsRef.current;
    const currentElapsed = Math.round(elapsedMs / 1000);

    // Client-side guard rails
    if (currentInterventions.length >= 2) return;
    if (currentElapsed < 15) return;
    if (evaluatingRef.current) return;
    if (fullTranscript.split(/\s+/).length < 10) return;

    const lastIntervention = currentInterventions[currentInterventions.length - 1];
    if (lastIntervention && (currentElapsed - lastIntervention.timestamp) < 20) return;

    evaluatingRef.current = true;
    try {
      const result: any = await apiPost('/realtime-coaching/evaluate', {
        question: params.question || '',
        fullTranscript,
        recentChunk,
        elapsedSeconds: currentElapsed,
        interventionCount: currentInterventions.length,
        previousInterventions: currentInterventions,
      });

      if (!mounted.current || mode !== 'recording') return;

      if (result.shouldIntervene && result.message) {
        const intervention: RealtimeIntervention = {
          timestamp: currentElapsed,
          issue: result.issue || 'general',
          severity: result.severity || 2,
          message: result.message,
          reasoning: result.reasoning || '',
        };
        triggerIntervention(intervention);
      }
    } catch {
      // Fail safe — don't intervene on error
    } finally {
      evaluatingRef.current = false;
    }
  }

  function triggerIntervention(intervention: RealtimeIntervention) {
    setInterventions(prev => [...prev, intervention]);
    setActiveIntervention(intervention);

    // Haptic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Animate banner in
    Animated.timing(bannerAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    // Speak via device TTS
    import('expo-speech').then(Speech => {
      Speech.default.speak(intervention.message, { language: 'en-US', rate: 1.0, pitch: 1.0 });
    }).catch(() => {});

    // Auto-dismiss after 5s
    if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
    bannerTimeout.current = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setActiveIntervention(null);
      });
    }, 5000);
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (mode === 'loading') {
    return <SafeAreaView style={s.safe}><LoadingScreen message="Preparing live coaching..." submessage="Connecting to speech service" /></SafeAreaView>;
  }

  if (mode === 'processing') {
    return <SafeAreaView style={s.safe}><LoadingScreen message={processingMsg} submessage="This usually takes a few seconds" /></SafeAreaView>;
  }

  if (mode === 'error') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.errorContainer}>
          <Text style={s.errorEmoji}>🎤</Text>
          <Text style={s.errorTitle}>Let's try again</Text>
          <Text style={s.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setMode('loading'); setErrorMsg(''); fetchKey(); }} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.ghostBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => { if (mode === 'recording') stopRecording(); else router.back(); }} hitSlop={12}>
            <Text style={s.backText}>{mode === 'recording' ? 'End' : '← Back'}</Text>
          </TouchableOpacity>
          <View style={s.liveBadge}>
            {mode === 'recording' && <PulseDot />}
            <Text style={s.liveText}>LIVE COACHING</Text>
          </View>
          <Text style={[s.timer, elapsed >= TIMER_MAX - 10 && { color: colors.error }]}>{timerStr}</Text>
        </View>

        {/* Question */}
        <View style={s.questionCard}>
          <Text style={s.questionText} numberOfLines={3}>"{params.question}"</Text>
        </View>

        {/* Intervention counter */}
        {interventions.length > 0 && (
          <View style={s.interventionCounter}>
            <Text style={s.interventionCountText}>
              {interventions.length}/2 coaching nudge{interventions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Live transcript */}
        <ScrollView
          ref={scrollRef}
          style={s.transcriptScroll}
          contentContainerStyle={s.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {mode === 'ready' && !liveText && (
            <FadeIn>
              <View style={s.readyState}>
                <Text style={s.readyEmoji}>🎓</Text>
                <Text style={s.readyTitle}>Real-Time Coaching</Text>
                <Text style={s.readyDesc}>
                  I'll listen while you answer and nudge you if I notice something — like burying your point, hedging, or going off track.
                </Text>
                <Text style={s.readyHint}>Maximum 2 nudges per session. Your recording continues uninterrupted.</Text>
              </View>
            </FadeIn>
          )}

          {liveText ? (
            <Text style={s.transcriptText}>
              {liveText}
              {interimText ? <Text style={s.interimText}> {interimText}</Text> : null}
            </Text>
          ) : mode === 'recording' ? (
            <Text style={s.placeholderText}>Listening...</Text>
          ) : null}
        </ScrollView>

        {/* Wave bars */}
        {mode === 'recording' && (
          <View style={s.waveRow}>
            <AudioWaveBars active={true} color={colors.realtime.text} height={wp(32)} barCount={16} />
          </View>
        )}

        {/* Action button */}
        <View style={s.btnArea}>
          {mode === 'ready' ? (
            <TouchableOpacity style={s.startBtn} onPress={startRecording} activeOpacity={0.8}>
              <Text style={s.startBtnText}>🎤 Start speaking</Text>
            </TouchableOpacity>
          ) : mode === 'recording' ? (
            <TouchableOpacity style={s.doneBtn} onPress={stopRecording} activeOpacity={0.8}>
              <View style={s.stopSq} />
              <Text style={s.doneBtnText}>Done — score my answer</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Coaching intervention banner */}
        {activeIntervention && (
          <Animated.View style={[s.banner, {
            opacity: bannerAnim,
            transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
          }]}>
            <View style={[s.bannerDot, activeIntervention.severity >= 3 ? s.bannerDotCritical : s.bannerDotNotable]} />
            <View style={s.bannerContent}>
              <Text style={s.bannerLabel}>{ISSUE_LABELS[activeIntervention.issue] || 'Coaching'}</Text>
              <Text style={s.bannerMessage}>{activeIntervention.message}</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Hidden WebView */}
      <WebView
        ref={webviewRef}
        source={coachingHtml}
        style={{ width: 0, height: 0, opacity: 0 }}
        onMessage={onMessage}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  backText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: wp(5), backgroundColor: colors.realtime.bg, borderWidth: 1.5, borderColor: colors.realtime.border, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(4) },
  liveText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.realtime.text, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  timer: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -1 },

  // Question
  questionCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  questionText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(18), fontStyle: 'italic' },

  // Intervention counter
  interventionCounter: { alignSelf: 'flex-start', backgroundColor: colors.realtime.bg, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3), marginBottom: spacing.sm },
  interventionCountText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.realtime.text },

  // Transcript
  transcriptScroll: { flex: 1, marginBottom: spacing.md },
  transcriptContent: { paddingBottom: spacing.lg },
  transcriptText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(24) },
  interimText: { color: colors.text.muted },
  placeholderText: { fontSize: typography.size.base, color: colors.text.muted, fontStyle: 'italic' },

  // Ready state
  readyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  readyEmoji: { fontSize: fp(44), marginBottom: spacing.lg },
  readyTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.md },
  readyDesc: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
  readyHint: { fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center', fontStyle: 'italic' },

  // Wave
  waveRow: { alignItems: 'center', marginBottom: spacing.md },

  // Buttons
  btnArea: { paddingTop: spacing.sm },
  startBtn: { backgroundColor: colors.realtime.text, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent },
  startBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: '#FFFFFF' },
  doneBtn: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.realtime.text, borderRadius: radius.lg, paddingVertical: wp(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6) },
  stopSq: { width: wp(11), height: wp(11), borderRadius: wp(3), backgroundColor: colors.error },
  doneBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.realtime.text },

  // Intervention banner
  banner: { position: 'absolute', top: wp(100), left: layout.screenPadding, right: layout.screenPadding, backgroundColor: '#FFF8F0', borderWidth: 2, borderColor: '#F0DCC8', borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.lg, zIndex: 100 },
  bannerDot: { width: wp(10), height: wp(10), borderRadius: wp(5) },
  bannerDotNotable: { backgroundColor: '#D4A060' },
  bannerDotCritical: { backgroundColor: colors.error },
  bannerContent: { flex: 1 },
  bannerLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(2) },
  bannerMessage: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, lineHeight: fp(18) },

  // Error
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  errorEmoji: { fontSize: fp(36), marginBottom: spacing.lg },
  errorTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  errorText: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), marginBottom: spacing.xl, paddingHorizontal: spacing.lg },
  retryBtn: { backgroundColor: colors.realtime.text, borderRadius: radius.lg, paddingVertical: wp(14), paddingHorizontal: wp(40), marginBottom: spacing.md },
  retryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: '#FFFFFF' },
  ghostBtn: { paddingVertical: spacing.md },
  ghostBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
