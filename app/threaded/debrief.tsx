import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { stopAudio, playCoachingAudio } from '../../src/services/tts';
import type { ThreadDebrief, ThreadTurn } from '../../src/types';

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

const THREAD_DIM_LABELS: Record<string, string> = {
  communicationClarity: 'Clarity',
  handlingPressure: 'Pressure',
  conciseness: 'Concision',
  substance: 'Substance',
  consistency: 'Consistency',
};

// Tap a thread dimension to see what it measures + how to read it. Thread
// dimensions differ from One Shot — they're about behaviour ACROSS turns, not
// a single answer.
const THREAD_DIM_INFO: Record<string, { what: string; scale: string }> = {
  communicationClarity: {
    what: 'How cleanly each turn landed. Could the other person follow what you meant without re-reading?',
    scale: '5 = had to guess what you meant. 7 = mostly clear, some hedging. 9 = every turn landed first try.',
  },
  handlingPressure: {
    what: 'How you held up when pushed back on. Did you stand your ground without escalating, or fold or flare?',
    scale: '5 = folded or escalated. 7 = held the line but stiffly. 9 = stayed warm, held the point, made them think.',
  },
  conciseness: {
    what: 'Whether each turn stayed tight under pressure. Long answers under pressure usually lose the point.',
    scale: '5 = rambled when challenged. 7 = mostly tight. 9 = sharp, every word earning its place.',
  },
  substance: {
    what: 'Whether your answers carried real specifics — names, numbers, concrete moves — instead of abstractions.',
    scale: '5 = generalities. 7 = some specifics. 9 = consistently grounded in real detail.',
  },
  consistency: {
    what: 'Whether your story stayed coherent across turns. Did the version of events match from turn 1 to turn 4?',
    scale: '5 = noticeable drift. 7 = small inconsistencies. 9 = same point, same stance, same facts throughout.',
  },
};

export default function DebriefScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ debrief: string; turns: string; characterName?: string }>();
  const debrief = safeParse<ThreadDebrief | null>(p.debrief, null);
  const turns = safeParse<ThreadTurn[]>(p.turns, []);
  // Character label for the conversation transcript. Falls back to
  // "Interviewer" for old saved threads without this param.
  const characterName = (p.characterName && p.characterName.length > 0) ? p.characterName : 'Interviewer';

  const [textOnly, setTextOnly] = useState(false);
  const [openDim, setOpenDim] = useState<string | null>(null);

  useEffect(() => {
    if (debrief?.summary) {
      playCoachingAudio(debrief.summary).catch(() => false).then((played) => { if (!played) setTextOnly(true); });
    }
    return () => { stopAudio(); };
  }, []);

  if (!debrief || !debrief.threadScores || !debrief.turnByTurn) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.errorText}>Could not load debrief data.</Text>
          <TouchableOpacity style={s.mainBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.mainBtnText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const trajLabel = debrief.trajectory === 'improving' ? 'Improving under pressure' : debrief.trajectory === 'declining' ? 'Lost ground under pressure' : 'Held steady under pressure';
  const trajUp = debrief.trajectory === 'improving';
  const trajSteady = debrief.trajectory === 'steady';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Thread Debrief</Text>
          <TouchableOpacity onPress={() => { stopAudio(); router.replace('/(tabs)'); }}>
            <Text style={s.close}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Score */}
        <FadeIn>
          <View style={s.scoreSection}>
            <View style={[s.ring, { borderColor: getScoreColor(debrief.overall) }]}>
              <ScoreReveal score={debrief.overall} color={getScoreColor(debrief.overall)} />
            </View>
            <Text style={s.scoreLbl}>Thread Score</Text>
            <View style={[s.trajBadge, trajUp ? s.trajUp : trajSteady ? s.trajSteady : s.trajDown]}>
              <Text style={[s.trajText, trajUp ? s.trajUpText : trajSteady ? s.trajSteadyText : s.trajDownText]}>
                {trajUp ? '↗' : debrief.trajectory === 'declining' ? '↘' : '→'} {trajLabel}
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* Summary */}
        <FadeIn delay={200}>
          <View style={s.sumCard}>
            <Text style={s.sumText}>{debrief.summary}</Text>
          </View>
        </FadeIn>

        {/* Pattern (new — conditional on new debrief field) */}
        {debrief.pattern && (
          <FadeIn delay={250}>
            <Text style={s.section}>The pattern</Text>
            <View style={s.patternCard}>
              <Text style={s.patternText}>{debrief.pattern}</Text>
            </View>
          </FadeIn>
        )}

        {/* Thread dimensions — tap a row to see what it measures + how to read */}
        <FadeIn delay={300}>
          <Text style={s.section}>Thread Dimensions</Text>
          <View style={s.dimCard}>
            {Object.entries(debrief.threadScores).map(([key, val]) => (
              <TouchableOpacity key={key} style={s.dimRow} onPress={() => setOpenDim(key)} activeOpacity={0.6}>
                <Text style={s.dimName}>{THREAD_DIM_LABELS[key] || key}</Text>
                <View style={s.dimTrack}>
                  <View style={[s.dimFill, { width: `${(val as number) * 10}%`, backgroundColor: getScoreColor(val as number) }]} />
                </View>
                <Text style={[s.dimVal, { color: getScoreColor(val as number) }]}>{val}</Text>
                <Text style={s.dimHelp}>ⓘ</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FadeIn>

        {/* Dimension info modal */}
        <Modal visible={!!openDim} animationType="fade" transparent onRequestClose={() => setOpenDim(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setOpenDim(null)}>
            <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
              {openDim && THREAD_DIM_INFO[openDim] && (
                <>
                  <Text style={s.modalTitle}>{THREAD_DIM_LABELS[openDim] || openDim}</Text>
                  <Text style={s.modalScore}>Your score: <Text style={{ color: getScoreColor((debrief.threadScores as any)[openDim] || 0), fontWeight: typography.weight.black }}>{(debrief.threadScores as any)[openDim] || 0}/10</Text></Text>
                  <Text style={s.modalSection}>What it measures</Text>
                  <Text style={s.modalText}>{THREAD_DIM_INFO[openDim].what}</Text>
                  <Text style={s.modalSection}>How to read it</Text>
                  <Text style={s.modalText}>{THREAD_DIM_INFO[openDim].scale}</Text>
                  <TouchableOpacity style={s.modalCloseBtn} onPress={() => setOpenDim(null)} activeOpacity={0.8}>
                    <Text style={s.modalCloseText}>Got it</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Turn by turn */}
        <FadeIn delay={400}>
          <Text style={s.section}>Turn by Turn</Text>
          <View style={s.card}>
            {debrief.turnByTurn.map((t, i) => (
              <View key={t.turn} style={[s.turnRow, i < debrief.turnByTurn.length - 1 && s.turnBorder]}>
                <View style={s.turnLeft}>
                  <Text style={s.turnNum}>Turn {t.turn}</Text>
                  {t.scoreChange != null && (
                    <Text style={[s.turnChange, String(t.scoreChange).startsWith('+') ? s.changeUp : s.changeDown]}>
                      {t.scoreChange}
                    </Text>
                  )}
                </View>
                <Text style={s.turnNote}>{t.note}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Character arc summary (new — how the other person responded across turns) */}
        {debrief.characterArcSummary && (
          <FadeIn delay={450}>
            <Text style={s.section}>How they read you</Text>
            <View style={s.arcCard}>
              <Text style={s.arcText}>{debrief.characterArcSummary}</Text>
            </View>
          </FadeIn>
        )}

        {/* Strongest moment */}
        {debrief.strongestMoment?.quote && (
          <FadeIn delay={500}>
            <Text style={s.section}>Strongest Moment</Text>
            <View style={s.strongCard}>
              <Text style={s.strongTurn}>Turn {debrief.strongestMoment.turn}</Text>
              <Text style={s.strongQuote}>"{debrief.strongestMoment.quote}"</Text>
            </View>
          </FadeIn>
        )}

        {/* Weakest snippet */}
        {debrief.weakestSnippet?.original && (
          <FadeIn delay={600}>
            <Text style={s.section}>Weakest Snippet</Text>
            <View style={s.weakCard}>
              <Text style={s.weakLabel}>What you said (Turn {debrief.weakestSnippet.turn})</Text>
              <Text style={s.weakOriginal}>"{debrief.weakestSnippet.original}"</Text>
              <Text style={s.weakLabel}>Sharper version</Text>
              <Text style={s.weakRewrite}>"{debrief.weakestSnippet.rewrite}"</Text>
              <Text style={s.weakExplanation}>{debrief.weakestSnippet.explanation}</Text>
            </View>
          </FadeIn>
        )}

        {/* One Thing — the headline takeaway. Single, actionable. */}
        {debrief.oneThing && (
          <FadeIn delay={650}>
            <Text style={s.section}>One thing to carry forward</Text>
            <View style={s.oneThingCard}>
              <Text style={s.oneThingText}>{debrief.oneThing}</Text>
            </View>
          </FadeIn>
        )}

        {/* Dodged questions */}
        {debrief.dodgedQuestions.length > 0 && (
          <FadeIn delay={700}>
            <Text style={s.section}>Questions to revisit</Text>
            {debrief.dodgedQuestions.map((d, i) => (
              <View key={i} style={s.dodgeCard}>
                <Text style={s.dodgeText}>{d}</Text>
              </View>
            ))}
          </FadeIn>
        )}

        {/* Full conversation */}
        <FadeIn delay={800}>
          <Text style={s.section}>Full Conversation</Text>
          {turns.map((turn, i) => (
            <View key={i} style={s.convoTurn}>
              <View style={s.convoQ}>
                <Text style={s.convoLabel}>{characterName} · Turn {turn.turnNumber}</Text>
                <Text style={s.convoText}>{turn.question}</Text>
              </View>
              <View style={s.convoA}>
                <Text style={[s.convoLabel, s.convoYou]}>You</Text>
                <Text style={s.convoTranscript}>{turn.transcript}</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        <View style={s.bottomSpacer} />
        <TouchableOpacity style={s.mainBtn} onPress={() => { stopAudio(); router.replace('/(tabs)'); }} activeOpacity={0.8}>
          <Text style={s.mainBtnText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => { stopAudio(); router.push('/one-shot/question?mode=threaded'); }} activeOpacity={0.7}>
          <Text style={s.ghostBtnText}>↻ New threaded challenge</Text>
        </TouchableOpacity>
        <View style={{ height: wp(30) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  errorText: { fontSize: typography.size.sm, color: colors.text.muted, marginBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(24), color: colors.text.muted, padding: spacing.sm, minWidth: wp(44), minHeight: wp(44), textAlign: 'center' },

  scoreSection: { alignItems: 'center', marginBottom: spacing.xl },
  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  trajBadge: { borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5) },
  trajUp: { backgroundColor: colors.feedback.positiveBg },
  trajSteady: { backgroundColor: colors.accent.light },
  trajDown: { backgroundColor: colors.accent.light },
  trajText: { fontSize: fp(11), fontWeight: typography.weight.bold },
  trajUpText: { color: colors.success },
  trajSteadyText: { color: colors.accent.primary },
  trajDownText: { color: colors.accent.primary },

  sumCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.md },
  sumText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22) },

  // The pattern card — what behaviour repeated across turns. Subtle accent.
  patternCard: { backgroundColor: colors.accent.light, borderRadius: radius.xl, padding: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent.primary, ...shadows.sm },
  patternText: { fontSize: typography.size.sm, color: colors.accent.dark, lineHeight: fp(22), fontWeight: typography.weight.semibold },

  // Character arc — how the relationship moved.
  arcCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm },
  arcText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(22), fontStyle: 'italic' as const },

  // One Thing — the headline takeaway. Highest visual weight after the score.
  oneThingCard: { backgroundColor: colors.feedback.positiveBg, borderRadius: radius.xl, padding: spacing.xl, borderLeftWidth: 4, borderLeftColor: colors.success, ...shadows.sm },
  oneThingText: { fontSize: typography.size.md, color: colors.text.primary, lineHeight: fp(24), fontWeight: typography.weight.semibold },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.lg, marginBottom: spacing.md },

  dimCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(6) },
  dimName: { fontSize: fp(11), color: colors.text.tertiary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(8), backgroundColor: colors.borderLight, borderRadius: wp(4), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(4) },
  dimVal: { fontSize: fp(14), fontWeight: typography.weight.black, width: wp(24), textAlign: 'right' },
  dimHelp: { fontSize: fp(11), color: colors.text.muted, marginLeft: wp(6), width: wp(14), textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(58,42,26,0.4)', alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  modalCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: wp(380), ...shadows.lg },
  modalTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  modalScore: { fontSize: typography.size.sm, color: colors.text.tertiary, marginBottom: spacing.lg },
  modalSection: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.sm },
  modalText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20) },
  modalCloseBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginTop: spacing.xl, ...shadows.accent },
  modalCloseText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md },
  turnRow: { padding: spacing.lg },
  turnBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  turnLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: wp(4) },
  turnNum: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.primary },
  turnChange: { fontSize: fp(10), fontWeight: typography.weight.bold },
  changeUp: { color: colors.success },
  changeDown: { color: colors.error },
  turnNote: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(18) },

  strongCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg },
  strongTurn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.success, marginBottom: spacing.sm },
  strongQuote: { fontSize: typography.size.base, color: colors.text.primary, fontStyle: 'italic', lineHeight: fp(22), fontWeight: typography.weight.semibold },

  weakCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
  weakLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.sm },
  weakOriginal: { fontSize: typography.size.sm, color: colors.error, fontStyle: 'italic', lineHeight: fp(20) },
  weakRewrite: { fontSize: typography.size.sm, color: colors.success, fontStyle: 'italic', lineHeight: fp(20) },
  weakExplanation: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: spacing.sm, lineHeight: fp(18) },

  dodgeCard: { backgroundColor: colors.accent.light, borderWidth: 1, borderColor: colors.accent.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  dodgeText: { fontSize: typography.size.sm, color: colors.text.secondary, fontWeight: typography.weight.semibold, lineHeight: fp(18) },

  convoTurn: { marginBottom: spacing.lg },
  convoQ: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderTopLeftRadius: wp(4), padding: spacing.md, marginBottom: spacing.sm, maxWidth: '85%', ...shadows.sm },
  convoLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(3) },
  convoText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20) },
  convoA: { backgroundColor: colors.accent.light, borderRadius: radius.lg, borderTopRightRadius: wp(4), padding: spacing.md, maxWidth: '85%', alignSelf: 'flex-end' },
  convoYou: { color: colors.accent.primary, textAlign: 'right' },
  convoTranscript: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' },

  bottomSpacer: { height: spacing.lg },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent, marginBottom: spacing.sm },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
