import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
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

export default function DebriefScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ debrief: string; turns: string }>();
  const debrief = safeParse<ThreadDebrief | null>(p.debrief, null);
  const turns = safeParse<ThreadTurn[]>(p.turns, []);

  const [textOnly, setTextOnly] = useState(false);

  useEffect(() => {
    if (debrief?.summary) {
      playCoachingAudio(debrief.summary).then((played) => { if (!played) setTextOnly(true); });
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

  const trajLabel = debrief.trajectory === 'improving' ? 'Improving across turns' : debrief.trajectory === 'declining' ? 'Declining under pressure' : 'Held steady';
  const trajUp = debrief.trajectory === 'improving';

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
            <View style={[s.trajBadge, trajUp ? s.trajUp : s.trajDown]}>
              <Text style={[s.trajText, trajUp ? s.trajUpText : s.trajDownText]}>
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

        {/* Thread dimensions */}
        <FadeIn delay={300}>
          <Text style={s.section}>Thread Dimensions</Text>
          <View style={s.dimCard}>
            {Object.entries(debrief.threadScores).map(([key, val]) => (
              <View key={key} style={s.dimRow}>
                <Text style={s.dimName}>{THREAD_DIM_LABELS[key] || key}</Text>
                <View style={s.dimTrack}>
                  <View style={[s.dimFill, { width: `${(val as number) * 10}%`, backgroundColor: getScoreColor(val as number) }]} />
                </View>
                <Text style={[s.dimVal, { color: getScoreColor(val as number) }]}>{val}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

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

        {/* Dodged questions */}
        {debrief.dodgedQuestions.length > 0 && (
          <FadeIn delay={700}>
            <Text style={s.section}>Dodged</Text>
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
                <Text style={s.convoLabel}>Sharp · Turn {turn.turnNumber}</Text>
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
  close: { fontSize: fp(22), color: colors.text.muted },

  scoreSection: { alignItems: 'center', marginBottom: spacing.xl },
  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  trajBadge: { borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5) },
  trajUp: { backgroundColor: colors.feedback.positiveBg },
  trajDown: { backgroundColor: colors.feedback.negativeBg },
  trajText: { fontSize: fp(11), fontWeight: typography.weight.bold },
  trajUpText: { color: colors.success },
  trajDownText: { color: colors.error },

  sumCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.md },
  sumText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22) },

  section: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginTop: spacing.lg, marginBottom: spacing.md },

  dimCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(6) },
  dimName: { fontSize: fp(11), color: colors.text.tertiary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(6), backgroundColor: colors.borderLight, borderRadius: wp(3), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(3) },
  dimVal: { fontSize: fp(14), fontWeight: typography.weight.black, width: wp(24), textAlign: 'right' },

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

  dodgeCard: { backgroundColor: colors.feedback.negativeBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  dodgeText: { fontSize: fp(10), color: colors.error, fontWeight: typography.weight.semibold, lineHeight: fp(16) },

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
