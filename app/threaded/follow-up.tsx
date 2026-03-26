import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn, AudioWaveBars } from '../../src/components/Animations';
import { playQuestionAudio, stopAudio, buildNaturalScript } from '../../src/services/tts';
import { getActiveThread } from '../../src/services/storage';
import type { ActiveThread } from '../../src/types';

export default function FollowUpScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ question: string; reaction: string; turnNumber: string; targeting: string; pressureLevel: string }>();
  const [thread, setThread] = useState<ActiveThread | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);

  const turnNum = parseInt(p.turnNumber || '2');
  const pressureLabel = p.pressureLevel === 'pressure' ? 'Pressure' : p.pressureLevel === 'pressing' ? 'Pressing' : 'Probing';

  useEffect(() => {
    mountedRef.current = true;
    loadThread();
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function loadThread() {
    const t = await getActiveThread();
    setThread(t);
    // Auto-speak the follow-up
    if (p.reaction && p.question) {
      setSpeaking(true);
      await playQuestionAudio(`${p.reaction} ${p.question}`);
      if (mountedRef.current) setSpeaking(false);
    }
  }

  async function replay() {
    setSpeaking(true);
    await playQuestionAudio(`${p.reaction || ''} ${p.question || ''}`);
    if (mountedRef.current) setSpeaking(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>Threaded Challenge</Text>
            <View style={s.turnBadge}>
              <Text style={s.turnText}>Turn {turnNum} of 4</Text>
            </View>
          </View>
          <View style={s.pressureBadge}>
            <Text style={s.pressureText}>{pressureLabel}</Text>
          </View>
        </View>

        {/* Progress dots */}
        <View style={s.dots}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={[s.dot, i < turnNum && s.dotDone, i === turnNum && s.dotCurrent]} />
          ))}
        </View>

        {/* Conversation thread */}
        <ScrollView
          ref={scrollRef}
          style={s.chatArea}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {thread?.turns.map((turn, i) => (
            <View key={i}>
              {/* Sharp's question bubble */}
              <View style={s.sharpBubbleWrap}>
                <Text style={s.bubbleLabel}>Sharp</Text>
                <View style={s.sharpBubble}>
                  <Text style={s.sharpText}>{turn.question}</Text>
                </View>
              </View>

              {/* User's answer bubble */}
              <View style={s.userBubbleWrap}>
                <Text style={s.bubbleLabelRight}>You</Text>
                <View style={s.userBubble}>
                  <Text style={s.userText}>
                    {turn.transcript.length > 120 ? turn.transcript.slice(0, 120) + '...' : turn.transcript}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* New follow-up from Sharp */}
          <FadeIn delay={200}>
            <View style={s.sharpBubbleWrap}>
              <Text style={s.bubbleLabel}>Sharp</Text>
              <View style={[s.sharpBubble, s.sharpBubbleNew]}>
                {p.reaction ? (
                  <Text style={s.reactionText}>{p.reaction}</Text>
                ) : null}
                <Text style={s.sharpTextNew}>{p.question}</Text>
              </View>
            </View>
          </FadeIn>
        </ScrollView>

        {/* Speaking indicator */}
        {speaking && (
          <View style={s.speakingRow}>
            <AudioWaveBars active={true} color={colors.accent.primary} height={wp(28)} barCount={16} />
            <Text style={s.speakingText}>Sharp is speaking...</Text>
          </View>
        )}

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.ghostBtn} onPress={replay} activeOpacity={0.7}>
            <Text style={s.ghostText}>🔊 Replay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.mainBtn}
            onPress={() => router.push({
              pathname: '/one-shot/recording',
              params: {
                question: p.question || '',
                mode: 'threaded',
                reasoning: '',
                timerSeconds: '90',
                turnNumber: String(turnNum),
              },
            })}
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

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2 },
  turnBadge: { backgroundColor: colors.duel.bg, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  turnText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.duel.text },
  pressureBadge: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  pressureText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: wp(5), paddingVertical: spacing.sm },
  dot: { width: wp(8), height: wp(4), borderRadius: wp(2), backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent.primary },
  dotCurrent: { backgroundColor: colors.accent.primary, width: wp(20) },

  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.lg },

  sharpBubbleWrap: { marginBottom: spacing.md, maxWidth: '85%' },
  bubbleLabel: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(3), marginLeft: wp(2) },
  sharpBubble: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderTopLeftRadius: radius.sm, padding: spacing.md, ...shadows.sm },
  sharpBubbleNew: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border },
  sharpText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },
  sharpTextNew: { fontSize: fp(14), color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.semibold },
  reactionText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), marginBottom: spacing.sm, fontStyle: 'italic' },

  userBubbleWrap: { marginBottom: spacing.md, alignItems: 'flex-end' },
  bubbleLabelRight: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(3), marginRight: wp(2) },
  userBubble: { backgroundColor: colors.accent.lightBg, borderRadius: radius.lg, borderTopRightRadius: radius.sm, padding: spacing.md, maxWidth: '85%', borderWidth: 1.5, borderColor: colors.accent.border },
  userText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' },

  speakingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), paddingVertical: spacing.sm },
  speakingText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold },

  actions: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.lg, gap: spacing.sm },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(12), alignItems: 'center' },
  ghostText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
