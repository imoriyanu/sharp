import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn, AudioWaveBars } from '../../src/components/Animations';
import { stopAudio, playFollowUpAudio } from '../../src/services/tts';
import { getThreadState } from '../../src/services/storage';
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
  stakes: { label: 'High Stakes', color: colors.accent.primary, bg: colors.accent.light },
  accountability: { label: 'Be Real', color: colors.accent.primary, bg: colors.accent.light },
  probing: { label: 'Probing', color: colors.success, bg: colors.feedback.positiveBg },
  pressing: { label: 'Pressing', color: colors.accent.primary, bg: colors.accent.light },
  pressure: { label: 'Pressure', color: colors.accent.primary, bg: colors.accent.light },
};

export default function FollowUpScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    reaction: string; question: string; targeting: string;
    pressureLevel: string; turnNumber: string; turns: string;
  }>();
  const [speaking, setSpeaking] = useState(false);
  const [textOnly, setTextOnly] = useState(false);
  // ThreadState is the source of truth for the pending character turn , 
  // nav params are a fast-path fallback. If the user backgrounds the app
  // and returns, nav params may be lost but ThreadState persists.
  const [resolved, setResolved] = useState<{
    reaction: string; question: string; pressureLevel: string; turns: ThreadTurn[]; turnNumber: number;
  } | null>(null);
  // Character name from ThreadState. Used in bubble labels. Falls back to
  // "Interviewer" for old threads started before the engine emitted this field.
  const [characterName, setCharacterName] = useState<string>('Interviewer');
  const mountedRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    mountedRef.current = true;
    resolveFromStateOrParams();
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function resolveFromStateOrParams() {
    // Try ThreadState first (background-survival path)
    try {
      const state = await getThreadState();
      if (state?.characterName && mountedRef.current) setCharacterName(state.characterName);
      if (state?.pendingCharacterTurn) {
        const turnNumber = (state.turns?.length || 0) + 1;
        const r = {
          reaction: state.pendingCharacterTurn.reaction || '',
          question: state.pendingCharacterTurn.followUp || p.question || '',
          pressureLevel: state.pendingCharacterTurn.pressureLevel || p.pressureLevel || 'depth',
          turns: state.turns || [],
          turnNumber,
        };
        if (mountedRef.current) setResolved(r);
        speakReactionAndQuestion(r.reaction, r.question);
        return;
      }
    } catch (_) { /* fall through to nav params */ }

    // Fallback: nav params (fast path on direct navigation from recording.tsx)
    const r = {
      reaction: p.reaction || '',
      question: p.question || '',
      pressureLevel: p.pressureLevel || 'depth',
      turns: safeParse<ThreadTurn[]>(p.turns, []),
      turnNumber: parseInt(p.turnNumber || '2'),
    };
    if (mountedRef.current) setResolved(r);
    speakReactionAndQuestion(r.reaction, r.question);
  }

  async function speakReactionAndQuestion(reaction: string, question: string) {
    const spoken = `${reaction || ''} ${question || ''}`.trim();
    if (!spoken) return;
    setSpeaking(true);
    const played = await playFollowUpAudio(spoken).catch(() => false);
    if (mountedRef.current) { setSpeaking(false); if (!played) setTextOnly(true); }
  }

  // Computed shorthand for render
  const turnNum = resolved?.turnNumber ?? parseInt(p.turnNumber || '2');
  const turns = resolved?.turns ?? safeParse<ThreadTurn[]>(p.turns, []);
  const pressure = STYLE_LABELS[resolved?.pressureLevel || p.pressureLevel || 'depth'] || STYLE_LABELS.depth;

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
                <Text style={s.bubbleLabel}>{characterName}</Text>
                <Text style={s.sharpText}>{turn.question}</Text>
              </View>
              <View style={s.userBubble}>
                <Text style={[s.bubbleLabel, s.userLabel]}>You</Text>
                <Text style={s.userText} numberOfLines={5}>{turn.transcript}</Text>
              </View>
            </View>
          ))}

          {/* Reaction */}
          {(resolved?.reaction || p.reaction) ? (
            <FadeIn delay={200}>
              <View style={s.reactionBubble}>
                <Text style={s.bubbleLabel}>{characterName}</Text>
                <Text style={s.reactionText}>{resolved?.reaction || p.reaction}</Text>
              </View>
            </FadeIn>
          ) : null}

          {/* Follow-up question */}
          <FadeIn delay={400}>
            <View style={s.questionBubble}>
              <Text style={s.questionText}>{resolved?.question || p.question}</Text>
            </View>
          </FadeIn>

          {speaking && (
            <View style={s.speakingRow}>
              <AudioWaveBars active={true} color={colors.accent.primary} height={wp(28)} barCount={16} />
              <Text style={s.speakingHint}>{characterName} is speaking...</Text>
            </View>
          )}
          {textOnly && !speaking && (
            <View style={s.textOnlyRow}>
              <Text style={s.textOnlyText}>Text only mode</Text>
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
              {!textOnly && (
                <TouchableOpacity style={s.replayBtn} onPress={() => speakReactionAndQuestion(resolved?.reaction || p.reaction || '', resolved?.question || p.question || '')} activeOpacity={0.7}>
                  <Text style={s.replayText}>🔊 Replay</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.recordBtn}
                onPress={() => router.push({
                  pathname: '/one-shot/recording',
                  params: { question: resolved?.question || p.question || '', mode: 'threaded', timerSeconds: '90' },
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
  textOnlyRow: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), alignSelf: 'flex-start', marginTop: spacing.sm },
  textOnlyText: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.muted },

  btnArea: { paddingTop: spacing.md, gap: spacing.sm },
  replayBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(12), alignItems: 'center' },
  replayText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  recordBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  recordText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  skipBtn: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
