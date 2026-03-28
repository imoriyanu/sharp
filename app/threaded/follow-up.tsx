import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn, AudioWaveBars } from '../../src/components/Animations';
import { stopAudio, playQuestionAudio } from '../../src/services/tts';
import type { ThreadTurn } from '../../src/types';

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

const STYLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  depth: { label: 'Going Deeper', color: colors.success, bg: colors.feedback.positiveBg },
  clarity: { label: 'Sharpen It', color: colors.accent.primary, bg: colors.accent.light },
  challenge: { label: 'Challenge', color: colors.accent.primary, bg: colors.daily.bg },
  perspective: { label: 'New Angle', color: colors.duel.text, bg: colors.duel.bg },
  stakes: { label: 'High Stakes', color: colors.error, bg: colors.feedback.negativeBg },
  accountability: { label: 'Be Real', color: colors.error, bg: colors.feedback.negativeBg },
  probing: { label: 'Probing', color: colors.success, bg: colors.feedback.positiveBg },
  pressing: { label: 'Pressing', color: colors.accent.primary, bg: colors.accent.light },
  pressure: { label: 'Pressure', color: colors.error, bg: colors.feedback.negativeBg },
};

export default function FollowUpScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    reaction: string; question: string; targeting: string;
    pressureLevel: string; turnNumber: string; turns: string;
  }>();
  const [speaking, setSpeaking] = useState(false);
  const mountedRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  const turnNum = parseInt(p.turnNumber || '2');
  const turns = safeParse<ThreadTurn[]>(p.turns, []);
  const pressure = STYLE_LABELS[p.pressureLevel || 'depth'] || STYLE_LABELS.depth;

  useEffect(() => {
    mountedRef.current = true;
    speakReactionAndQuestion();
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function speakReactionAndQuestion() {
    const spoken = `${p.reaction || ''} ${p.question || ''}`.trim();
    if (!spoken) return;
    setSpeaking(true);
    await playQuestionAudio(spoken);
    if (mountedRef.current) setSpeaking(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Progress */}
        <View style={s.progressRow}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={[s.dot, i < turnNum && s.dotDone, i === turnNum && s.dotCurrent]} />
          ))}
          <View style={[s.pressureBadge, { backgroundColor: pressure.bg }]}>
            <Text style={[s.pressureText, { color: pressure.color }]}>{pressure.label}</Text>
          </View>
        </View>
        <Text style={s.turnLabel}>Turn {turnNum} of 4</Text>

        {/* Chat thread */}
        <ScrollView
          ref={scrollRef}
          style={s.chatScroll}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {turns.map((turn, i) => (
            <View key={i}>
              <View style={s.sharpBubble}>
                <Text style={s.bubbleLabel}>Sharp</Text>
                <Text style={s.sharpText}>{turn.question}</Text>
              </View>
              <View style={s.userBubble}>
                <Text style={[s.bubbleLabel, s.userLabel]}>You</Text>
                <Text style={s.userText} numberOfLines={3}>{turn.transcript}</Text>
              </View>
            </View>
          ))}

          {/* Reaction */}
          {p.reaction ? (
            <FadeIn delay={200}>
              <View style={s.reactionBubble}>
                <Text style={s.bubbleLabel}>Sharp</Text>
                <Text style={s.reactionText}>{p.reaction}</Text>
              </View>
            </FadeIn>
          ) : null}

          {/* Follow-up question */}
          <FadeIn delay={400}>
            <View style={s.questionBubble}>
              <Text style={s.questionText}>{p.question}</Text>
            </View>
          </FadeIn>

          {speaking && (
            <View style={s.speakingRow}>
              <AudioWaveBars active={true} color={colors.accent.primary} height={wp(28)} barCount={16} />
              <Text style={s.speakingHint}>Sharp is speaking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={s.btnArea}>
          {speaking ? (
            <TouchableOpacity style={s.skipBtn} onPress={() => { stopAudio(); setSpeaking(false); }} activeOpacity={0.7}>
              <Text style={s.skipText}>Skip →</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={s.replayBtn} onPress={speakReactionAndQuestion} activeOpacity={0.7}>
                <Text style={s.replayText}>🔊 Replay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.recordBtn}
                onPress={() => router.push({
                  pathname: '/one-shot/recording',
                  params: { question: p.question || '', mode: 'threaded', timerSeconds: '90' },
                })}
                activeOpacity={0.8}
              >
                <Text style={s.recordText}>🎤 Record my answer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: wp(5), marginBottom: spacing.sm },
  dot: { width: wp(8), height: wp(8), borderRadius: wp(4), backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent.primary },
  dotCurrent: { backgroundColor: colors.accent.primary, width: wp(22), borderRadius: wp(4) },
  pressureBadge: { marginLeft: 'auto', borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  pressureText: { fontSize: fp(9), fontWeight: typography.weight.black, textTransform: 'uppercase' as const, letterSpacing: 1 },
  turnLabel: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted, marginBottom: spacing.md },

  chatScroll: { flex: 1 },
  chatContent: { paddingBottom: spacing.lg },

  sharpBubble: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderTopLeftRadius: wp(4), padding: spacing.md, marginBottom: spacing.sm, maxWidth: '85%', ...shadows.sm },
  bubbleLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(3) },
  sharpText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20) },

  userBubble: { backgroundColor: colors.accent.light, borderRadius: radius.lg, borderTopRightRadius: wp(4), padding: spacing.md, marginBottom: spacing.md, maxWidth: '85%', alignSelf: 'flex-end' },
  userLabel: { color: colors.accent.primary, textAlign: 'right' },
  userText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' },

  reactionBubble: { backgroundColor: colors.daily.bg, borderRadius: radius.lg, borderTopLeftRadius: wp(4), padding: spacing.md, marginBottom: spacing.sm, maxWidth: '85%', borderWidth: 1.5, borderColor: colors.daily.border },
  reactionText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },

  questionBubble: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.md },
  questionText: { fontSize: fp(15), color: colors.text.primary, lineHeight: fp(24), fontWeight: typography.weight.bold },

  speakingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  speakingHint: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold },

  btnArea: { paddingTop: spacing.md, gap: spacing.sm },
  replayBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(12), alignItems: 'center' },
  replayText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  recordBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  recordText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  skipBtn: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
