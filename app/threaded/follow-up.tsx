import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { stopAudio } from '../../src/services/tts';

export default function FollowUpScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ question: string; turnNumber: string; prevScore: string; targeting: string }>();
  useEffect(() => {
    return () => { stopAudio(); };
  }, []);

  const turnNum = parseInt(p.turnNumber || '2');
  const prevScore = parseFloat(p.prevScore || '0');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.prevBox}>
          <Text style={s.prevLabel}>Turn {turnNum - 1} score</Text>
          <Text style={[s.prevScore, { color: getScoreColor(prevScore) }]}>{prevScore.toFixed(1)}</Text>
        </View>

        <View style={s.dots}>
          {[1,2,3,4].map(i => (
            <View key={i} style={[s.dot, i < turnNum && s.dotDone, i === turnNum && s.dotCurrent]} />
          ))}
        </View>

        <Text style={s.tag}>Follow-up {turnNum - 1} of 3</Text>
        <View style={s.readyPill}><Text style={s.readyText}>✓ Ready</Text></View>

        <FadeIn delay={100}>
          <Text style={s.questionText}>"{p.question}"</Text>
        </FadeIn>

        {p.targeting && (
          <FadeIn delay={300}>
            <View style={s.targetPill}><Text style={s.targetText}>Targeting: {p.targeting}</Text></View>
          </FadeIn>
        )}

        <View style={s.spacer} />

        <TouchableOpacity style={s.ghostBtn} activeOpacity={0.7}>
          <Text style={s.ghostText}>↻ Replay question</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => router.push({ pathname: '/one-shot/recording', params: { question: p.question || '', mode: 'threaded' } })}
          activeOpacity={0.8}
        >
          <Text style={s.mainText}>🎤 Record my answer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, justifyContent: 'center' },
  prevBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, ...shadows.sm },
  prevLabel: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },
  prevScore: { fontSize: fp(18), fontWeight: typography.weight.black },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: wp(5), marginBottom: spacing.xl },
  dot: { width: wp(8), height: wp(8), borderRadius: wp(4), backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent.primary },
  dotCurrent: { backgroundColor: colors.accent.primary, width: wp(22), borderRadius: wp(4) },
  tag: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: spacing.md },
  spacer: { flex: 1 },
  readyPill: { alignSelf: 'flex-start', backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(3), marginBottom: spacing.lg },
  readyText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success },
  questionText: { fontSize: fp(15), color: colors.text.primary, lineHeight: fp(24), fontWeight: typography.weight.semibold, marginBottom: spacing.lg },
  targetPill: { alignSelf: 'flex-start', backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.sm, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  targetText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginBottom: spacing.sm },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  mainText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
});
