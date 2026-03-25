import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { stopAudio } from '../../src/services/tts';

// TODO: receive debrief data via params or state management
export default function DebriefScreen() {
  const router = useRouter();

  useEffect(() => {
    return () => { stopAudio(); };
  }, []);

  // Placeholder data — replace with real debrief from API
  const debrief = {
    overall: 7.1,
    trajectory: 'improving' as const,
    summary: 'You started hesitant but gained confidence with each follow-up. By turn 3, you were leading with specifics. Turn 2 was weakest — you dodged the metrics question.',
    turns: [
      { turn: 1, score: 6.2 },
      { turn: 2, score: 5.8 },
      { turn: 3, score: 7.6 },
      { turn: 4, score: 8.1 },
    ],
    dodged: 'Turn 2: avoided stating the specific latency improvement when asked directly.',
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Thread Debrief</Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        <FadeIn delay={0}>
          <View style={s.ring}>
            <ScoreReveal score={debrief.overall} color={getScoreColor(debrief.overall)} />
          </View>
          <Text style={s.scoreLbl}>Thread Score</Text>
        </FadeIn>

        <FadeIn delay={200}>
          <View style={[s.trajBadge, debrief.trajectory === 'improving' ? s.trajUp : s.trajDown]}>
            <Text style={[s.trajText, debrief.trajectory === 'improving' ? s.trajUpText : s.trajDownText]}>
              {debrief.trajectory === 'improving' ? '↗ Improving across turns' : debrief.trajectory === 'declining' ? '↘ Declining' : '→ Steady'}
            </Text>
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <View style={s.sumCard}><Text style={s.sumText}>{debrief.summary}</Text></View>
        </FadeIn>

        <FadeIn delay={400}>
          <Text style={s.section}>Turn by turn</Text>
          <View style={s.card}>
            {debrief.turns.map((t, i) => (
              <View key={t.turn} style={[s.turnRow, i < debrief.turns.length - 1 && s.turnBorder]}>
                <Text style={s.turnLabel}>Turn {t.turn}</Text>
                <Text style={[s.turnScore, { color: getScoreColor(t.score) }]}>{t.score.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {debrief.dodged && (
          <FadeIn delay={500}>
            <Text style={s.section}>Dodged</Text>
            <View style={s.dodgeCard}><Text style={s.dodgeText}>{debrief.dodged}</Text></View>
          </FadeIn>
        )}

        <View style={s.bottomSpacer} />
        <TouchableOpacity style={s.mainBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
          <Text style={s.mainBtnText}>Done</Text>
        </TouchableOpacity>
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
  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.xs },
  scoreNum: { fontSize: fp(34), fontWeight: typography.weight.black, letterSpacing: -1.5 },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, textAlign: 'center', marginBottom: spacing.lg },
  trajBadge: { alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(4), marginBottom: spacing.lg },
  trajUp: { backgroundColor: colors.feedback.positiveBg },
  trajDown: { backgroundColor: colors.feedback.negativeBg },
  trajText: { fontSize: fp(10), fontWeight: typography.weight.bold },
  trajUpText: { color: colors.success },
  trajDownText: { color: colors.error },
  sumCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md },
  sumText: { fontSize: fp(11), color: colors.text.secondary, lineHeight: fp(18) },
  section: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.md },
  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md },
  turnRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  turnBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  turnLabel: { fontSize: fp(11), color: colors.text.secondary },
  turnScore: { fontSize: fp(15), fontWeight: typography.weight.black },
  bottomSpacer: { height: spacing.lg },
  dodgeCard: { backgroundColor: colors.feedback.negativeBg, borderRadius: radius.md, padding: spacing.md },
  dodgeText: { fontSize: fp(10), color: colors.error, fontWeight: typography.weight.semibold, lineHeight: fp(16) },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
});
