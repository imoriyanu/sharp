import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { stopAudio, playQuestionAudio } from '../../src/services/tts';
import { getActiveThread, clearActiveThread } from '../../src/services/storage';
import type { ThreadDebrief, ActiveThread } from '../../src/types';

export default function DebriefScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ debrief: string }>();
  const [thread, setThread] = useState<ActiveThread | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const debrief: ThreadDebrief | null = p.debrief ? JSON.parse(p.debrief) : null;

  useEffect(() => {
    loadThread();
    return () => { stopAudio(); };
  }, []);

  async function loadThread() {
    const t = await getActiveThread();
    setThread(t);
    // Speak the summary
    if (debrief?.summary) {
      setSpeaking(true);
      await playQuestionAudio(debrief.summary);
      setSpeaking(false);
    }
  }

  async function handleDone() {
    await stopAudio();
    await clearActiveThread();
    router.replace('/(tabs)');
  }

  if (!debrief) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.errorContainer}>
          <Text style={s.errorText}>Something went wrong loading the debrief.</Text>
          <TouchableOpacity style={s.mainBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Text style={s.mainBtnText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Thread Debrief</Text>
          <TouchableOpacity onPress={handleDone}><Text style={s.close}>x</Text></TouchableOpacity>
        </View>

        {/* Overall score */}
        <FadeIn delay={0}>
          <View style={[s.ring, { borderColor: getScoreColor(debrief.overall) }]}>
            <ScoreReveal score={debrief.overall} color={getScoreColor(debrief.overall)} />
          </View>
          <Text style={s.scoreLbl}>Thread Score</Text>
        </FadeIn>

        {/* Trajectory */}
        <FadeIn delay={200}>
          <View style={[s.trajBadge, debrief.trajectory === 'improving' ? s.trajUp : debrief.trajectory === 'declining' ? s.trajDown : s.trajSteady]}>
            <Text style={[s.trajText, debrief.trajectory === 'improving' ? s.trajUpText : debrief.trajectory === 'declining' ? s.trajDownText : s.trajSteadyText]}>
              {debrief.trajectory === 'improving' ? '↗ Improving under pressure' : debrief.trajectory === 'declining' ? '↘ Declining under pressure' : '→ Steady throughout'}
            </Text>
          </View>
        </FadeIn>

        {/* Summary */}
        <FadeIn delay={300}>
          <View style={s.sumCard}>
            <Text style={s.sumText}>{debrief.summary}</Text>
          </View>
        </FadeIn>

        {/* Thread scores */}
        <FadeIn delay={400}>
          <Text style={s.section}>Thread dimensions</Text>
          <View style={s.card}>
            {[
              { key: 'communicationClarity', label: 'Clarity' },
              { key: 'handlingPressure', label: 'Pressure Handling' },
              { key: 'conciseness', label: 'Conciseness' },
              { key: 'substance', label: 'Substance' },
              { key: 'consistency', label: 'Consistency' },
            ].map((dim) => {
              const val = (debrief.threadScores as any)[dim.key] || 0;
              return (
                <View key={dim.key} style={s.dimRow}>
                  <Text style={s.dimLabel}>{dim.label}</Text>
                  <View style={s.dimTrack}><View style={[s.dimFill, { width: `${val * 10}%`, backgroundColor: getScoreColor(val) }]} /></View>
                  <Text style={[s.dimVal, { color: getScoreColor(val) }]}>{val}</Text>
                </View>
              );
            })}
          </View>
        </FadeIn>

        {/* Turn by turn */}
        <FadeIn delay={500}>
          <Text style={s.section}>Turn by turn</Text>
          <View style={s.card}>
            {debrief.turnByTurn.map((t, i) => (
              <View key={t.turn} style={[s.turnRow, i < debrief.turnByTurn.length - 1 && s.turnBorder]}>
                <View style={s.turnHeader}>
                  <Text style={s.turnLabel}>Turn {t.turn}</Text>
                  {t.scoreChange && (
                    <Text style={[s.scoreChange, t.scoreChange.startsWith('+') ? s.scoreUp : s.scoreDown]}>
                      {t.scoreChange}
                    </Text>
                  )}
                </View>
                <Text style={s.turnNote}>{t.note}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Strongest moment */}
        {debrief.strongestMoment && (
          <FadeIn delay={600}>
            <Text style={s.section}>Strongest moment</Text>
            <View style={s.strongCard}>
              <Text style={s.strongTurn}>Turn {debrief.strongestMoment.turn}</Text>
              <Text style={s.strongQuote}>"{debrief.strongestMoment.quote}"</Text>
            </View>
          </FadeIn>
        )}

        {/* Weakest snippet */}
        {debrief.weakestSnippet && (
          <FadeIn delay={700}>
            <Text style={s.section}>Room to improve</Text>
            <View style={s.weakCard}>
              <Text style={s.weakTurn}>Turn {debrief.weakestSnippet.turn}</Text>
              <Text style={s.weakOriginal}>"{debrief.weakestSnippet.original}"</Text>
              <View style={s.weakProblems}>
                {debrief.weakestSnippet.problems.map((prob, i) => (
                  <Text key={i} style={s.weakProblem}>• {prob}</Text>
                ))}
              </View>
              <View style={s.rewriteBox}>
                <Text style={s.rewriteLabel}>Sharper version</Text>
                <Text style={s.rewriteText}>"{debrief.weakestSnippet.rewrite}"</Text>
              </View>
              <Text style={s.weakExplanation}>{debrief.weakestSnippet.explanation}</Text>
            </View>
          </FadeIn>
        )}

        {/* Dodged questions */}
        {debrief.dodgedQuestions && debrief.dodgedQuestions.length > 0 && (
          <FadeIn delay={800}>
            <Text style={s.section}>Dodged</Text>
            <View style={s.dodgeCard}>
              {debrief.dodgedQuestions.map((d, i) => (
                <Text key={i} style={s.dodgeText}>• {d}</Text>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Full conversation */}
        {thread && thread.turns.length > 0 && (
          <FadeIn delay={900}>
            <Text style={s.section}>Full conversation</Text>
            {thread.turns.map((turn, i) => (
              <View key={i} style={s.convoTurn}>
                <View style={s.convoQ}>
                  <Text style={s.convoLabel}>Sharp</Text>
                  <Text style={s.convoQText}>{turn.question}</Text>
                </View>
                <View style={s.convoA}>
                  <Text style={s.convoLabelRight}>You</Text>
                  <Text style={s.convoAText}>{turn.transcript}</Text>
                </View>
              </View>
            ))}
          </FadeIn>
        )}

        <View style={s.bottomSpacer} />
        <TouchableOpacity style={s.mainBtn} onPress={handleDone} activeOpacity={0.8}>
          <Text style={s.mainBtnText}>Done</Text>
        </TouchableOpacity>
        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },

  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.xs },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, textAlign: 'center', marginBottom: spacing.lg },

  trajBadge: { alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), marginBottom: spacing.lg },
  trajUp: { backgroundColor: colors.feedback.positiveBg },
  trajDown: { backgroundColor: colors.feedback.negativeBg },
  trajSteady: { backgroundColor: colors.bg.tertiary },
  trajText: { fontSize: fp(11), fontWeight: typography.weight.bold },
  trajUpText: { color: colors.success },
  trajDownText: { color: colors.error },
  trajSteadyText: { color: colors.text.tertiary },

  sumCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
  sumText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  section: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.md },

  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: wp(8) },
  dimLabel: { fontSize: fp(11), color: colors.text.tertiary, width: wp(90), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(6), backgroundColor: colors.borderLight, borderRadius: wp(3), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(3) },
  dimVal: { fontSize: fp(14), fontWeight: typography.weight.black, width: wp(24), textAlign: 'right' },

  turnRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  turnBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  turnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: wp(4) },
  turnLabel: { fontSize: fp(12), fontWeight: typography.weight.bold, color: colors.text.primary },
  scoreChange: { fontSize: fp(12), fontWeight: typography.weight.black },
  scoreUp: { color: colors.success },
  scoreDown: { color: colors.error },
  turnNote: { fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(18) },

  strongCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg },
  strongTurn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.success, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  strongQuote: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontStyle: 'italic', fontWeight: typography.weight.semibold },

  weakCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
  weakTurn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.error, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  weakOriginal: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic', marginBottom: spacing.md },
  weakProblems: { marginBottom: spacing.md },
  weakProblem: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18) },
  rewriteBox: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  rewriteLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.success, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  rewriteText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },
  weakExplanation: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18) },

  dodgeCard: { backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, padding: spacing.lg },
  dodgeText: { fontSize: typography.size.xs, color: colors.error, fontWeight: typography.weight.semibold, lineHeight: fp(18) },

  convoTurn: { marginBottom: spacing.lg },
  convoQ: { marginBottom: spacing.sm },
  convoLabel: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(2) },
  convoQText: { fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(18), backgroundColor: colors.bg.secondary, borderRadius: radius.md, padding: spacing.sm },
  convoA: { alignItems: 'flex-end' },
  convoLabelRight: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(2) },
  convoAText: { fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(18), backgroundColor: colors.accent.lightBg, borderWidth: 1, borderColor: colors.accent.border, borderRadius: radius.md, padding: spacing.sm, maxWidth: '90%' },

  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: layout.screenPadding },
  errorText: { fontSize: typography.size.sm, color: colors.text.secondary, marginBottom: spacing.xl },

  bottomSpacer: { height: spacing.lg },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
});
