import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { PulsingRings, AudioWaveBars } from '../../src/components/Animations';
import { SharpFox } from '../../src/components/Illustrations';
import { getConversationState, saveConversationState } from '../../src/services/storage';
import { apiPost } from '../../src/services/api';
import type { ConversationState, ConversationTurn } from '../../src/types';

// @ts-ignore
const conversationHtml = require('../../assets/conversation.html');

type Mode = 'connecting' | 'speaking' | 'listening' | 'disconnected';

export default function ConversationLive() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    agentPersona: string;
    scenarioDescription: string;
    openingLine: string;
    systemPrompt: string;
  }>();

  const [convState, setConvState] = useState<ConversationState | null>(null);
  const [mode, setMode] = useState<Mode>('connecting');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [lastAgentText, setLastAgentText] = useState('');

  const MAX_SECONDS = 5 * 60; // 5 minute cap

  const webviewRef = useRef<WebView>(null);
  const webviewReady = useRef(false);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const rawTranscript = useRef<{ role: 'user' | 'agent'; message: string }[]>([]);
  const breatheAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breatheAnim, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
      Animated.timing(breatheAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadState();
    elapsedRef.current = setInterval(() => setElapsed(p => {
      if (p + 1 >= MAX_SECONDS) { handleEnd(); return p; }
      return p + 1;
    }), 1000);
    return () => { mounted.current = false; if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, []);

  useEffect(() => {
    if (signedUrl && webviewReady.current && convState) sendStart();
  }, [signedUrl]);

  function sendStart() {
    if (!signedUrl || !convState) return;
    webviewRef.current?.postMessage(JSON.stringify({
      type: 'start', signedUrl,
      systemPrompt: params.systemPrompt || '',
      firstMessage: params.openingLine || convState.turns[0]?.agentMessage || 'Hello, shall we get started?',
    }));
  }

  async function loadState() {
    const loaded = await getConversationState();
    if (!loaded) { router.back(); return; }
    setConvState(loaded);
    try {
      const { signedUrl: url } = await apiPost<{ signedUrl: string }>('/conversation/signed-url', {});
      if (mounted.current) setSignedUrl(url);
    } catch (e: any) {
      if (mounted.current) setError(e?.message || 'Could not connect.');
    }
  }

  function onWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') { webviewReady.current = true; if (convState && signedUrl) sendStart(); }
      if (msg.type === 'status') {
        if (msg.status === 'connected') { setError(''); setMode('listening'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
        if (msg.status === 'disconnected' || msg.status === 'ended') setMode('disconnected');
      }
      if (msg.type === 'mode') {
        setMode(msg.mode === 'speaking' ? 'speaking' : 'listening');
        if (msg.mode === 'speaking') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (msg.type === 'message') {
        rawTranscript.current.push({ role: msg.role, message: msg.message });
        if (msg.role === 'agent') setLastAgentText(msg.message);
      }
      if (msg.type === 'transcript' && msg.transcript?.length) rawTranscript.current = msg.transcript;
      if (msg.type === 'error') setError(msg.message || 'Connection error');
    } catch {}
  }

  async function handleEnd() {
    if (ending) return;
    setEnding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    webviewRef.current?.postMessage(JSON.stringify({ type: 'stop' }));
    await new Promise(r => setTimeout(r, 600));
    const turns = groupTranscript(rawTranscript.current);
    if (convState) await saveConversationState({ ...convState, turns });
    if (mounted.current) router.replace({ pathname: '/conversation/debrief' });
  }

  function groupTranscript(entries: { role: string; message: string }[]): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    let agent = '', user = '', num = 0;
    for (const e of entries) {
      if (e.role === 'agent') {
        if (agent && user) { turns.push({ turnNumber: num++, agentMessage: agent, userTranscript: user, timestamp: new Date().toISOString() }); agent = ''; user = ''; }
        agent += (agent ? ' ' : '') + e.message;
      } else { user += (user ? ' ' : '') + e.message; }
    }
    if (agent || user) turns.push({ turnNumber: num, agentMessage: agent, userTranscript: user, timestamp: new Date().toISOString() });
    return turns;
  }

  const persona = params.agentPersona?.split(',')[0] || 'Agent';
  const remaining = Math.max(0, MAX_SECONDS - elapsed);
  const rMins = Math.floor(remaining / 60);
  const rSecs = remaining % 60;
  const timer = `${rMins}:${String(rSecs).padStart(2, '0')}`;
  const isSpeaking = mode === 'speaking';
  const isListening = mode === 'listening';
  const isConnecting = mode === 'connecting';
  const isLive = isSpeaking || isListening;
  const isLowTime = remaining <= 60;

  return (
    <SafeAreaView style={s.safe}>
      <WebView ref={webviewRef} source={conversationHtml} style={s.webview} onMessage={onWebViewMessage}
        allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mediaCapturePermissionGrantType="grant"
        javaScriptEnabled originWhitelist={['*']} />

      {/* ── MIDDLE: timer + fox centered ── */}
      <View style={s.middle}>
        <View style={s.timerAbove}>
          <Text style={[s.timerBig, isLowTime && s.timerLow]}>{timer}</Text>
          {isLive && <View style={s.liveDotBig} />}
        </View>
        <Animated.View style={[s.foxOuter, { transform: [{ scale: isLive ? breatheAnim : 1 }] }]}>
          {isSpeaking && <PulsingRings active color={colors.accent.primary} size={wp(170)} />}
          {isListening && <PulsingRings active color={colors.recording} size={wp(170)} />}
          <View style={[s.foxCircle, isSpeaking && s.foxSpeaking, isListening && s.foxListening]}>
            <SharpFox size={wp(72)} expression={isListening ? 'listening' : isConnecting ? 'thinking' : 'happy'} />
          </View>
        </Animated.View>
      </View>

      {/* ── BOTTOM: name, scenario, status, end call ── */}
      <View style={s.bottom}>
        <Text style={s.name}>{persona}</Text>
        <Text style={s.scenario}>{params.scenarioDescription || ''}</Text>

        {isSpeaking ? (
          <View style={[s.statusPill, s.statusSpeaking]}>
            <AudioWaveBars active barCount={5} color={colors.accent.primary} height={wp(14)} />
            <Text style={[s.statusLabel, { color: colors.accent.primary }]}>{persona} is speaking</Text>
          </View>
        ) : isListening ? (
          <View style={[s.statusPill, s.statusListening]}>
            <AudioWaveBars active barCount={5} color={colors.recording} height={wp(14)} />
            <Text style={[s.statusLabel, { color: colors.recording }]}>Listening to you</Text>
          </View>
        ) : isConnecting ? (
          <View style={s.statusPill}><Text style={s.statusLabel}>Connecting...</Text></View>
        ) : (
          <View style={s.statusPill}><Text style={s.statusLabel}>Call ended</Text></View>
        )}

        {error ? (
          <View style={s.errorRow}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setError(''); setMode('connecting'); loadState(); }}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.btnRow}>
          <View style={s.btnCol}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { if (!ending) { webviewRef.current?.postMessage(JSON.stringify({ type: 'stop' })); router.replace('/(tabs)'); } }} activeOpacity={0.7}>
              <Text style={s.cancelIcon}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={s.cancelLabel}>Cancel</Text>
          </View>
          <View style={s.btnCol}>
            <TouchableOpacity style={[s.endBtn, ending && { opacity: 0.4 }]} onPress={handleEnd} activeOpacity={0.7} disabled={ending}>
              <Text style={s.endIcon}>{'✕'}</Text>
            </TouchableOpacity>
            <Text style={s.endLabel}>{ending ? 'Ending...' : 'End call'}</Text>
          </View>
        </View>
      </View>

    </SafeAreaView>
  );
}

const AVATAR = wp(115);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  webview: { width: 0, height: 0, position: 'absolute', opacity: 0 },

  // Timer above fox
  timerAbove: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  timerBig: { fontSize: fp(32), fontWeight: typography.weight.black, color: colors.text.primary, fontVariant: ['tabular-nums'] as any, letterSpacing: -1 },
  timerLow: { color: colors.error },
  liveDotBig: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: colors.error },

  // Middle — fox takes remaining space, centered
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  foxOuter: { width: wp(180), height: wp(180), alignItems: 'center', justifyContent: 'center' },
  foxCircle: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    backgroundColor: colors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.borderLight,
    ...shadows.lg,
  },
  foxSpeaking: { borderColor: colors.accent.primary, backgroundColor: colors.accent.light },
  foxListening: { borderColor: colors.recording, backgroundColor: 'rgba(192,80,80,0.06)' },

  // Bottom — info + end call
  bottom: { alignItems: 'center', paddingHorizontal: layout.screenPadding, paddingBottom: wp(20) },
  name: { fontSize: fp(22), fontWeight: typography.weight.black, color: colors.text.primary, textAlign: 'center' },
  scenario: { fontSize: fp(11), color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(17), marginTop: spacing.xs, paddingHorizontal: spacing.sm },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, backgroundColor: colors.bg.tertiary, borderRadius: radius.pill,
    paddingVertical: wp(7), paddingHorizontal: spacing.lg,
  },
  statusSpeaking: { backgroundColor: colors.accent.light },
  statusListening: { backgroundColor: 'rgba(192,80,80,0.08)' },
  statusLabel: { fontSize: fp(12), fontWeight: typography.weight.bold, color: colors.text.muted },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  errorText: { fontSize: fp(10), color: colors.error, fontWeight: typography.weight.semibold },
  retryText: { fontSize: fp(10), color: colors.accent.primary, fontWeight: typography.weight.bold },

  btnRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: wp(40), marginTop: spacing.lg },
  btnCol: { alignItems: 'center' },
  cancelBtn: {
    width: wp(50), height: wp(50), borderRadius: wp(25),
    backgroundColor: colors.bg.tertiary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  cancelIcon: { fontSize: fp(18), color: colors.text.muted, fontWeight: typography.weight.bold },
  cancelLabel: { fontSize: fp(9), color: colors.text.muted, fontWeight: typography.weight.semibold, marginTop: spacing.xs },
  endBtn: {
    width: wp(56), height: wp(56), borderRadius: wp(28),
    backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center',
    ...shadows.md,
  },
  endIcon: { fontSize: fp(20), color: colors.text.inverse, fontWeight: typography.weight.black },
  endLabel: { fontSize: fp(9), color: colors.text.muted, fontWeight: typography.weight.semibold, marginTop: spacing.xs },
});
