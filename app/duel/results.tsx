import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';

export default function DuelResultsScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    question: string;
    yourScore: string; yourInsight: string;
    theirScore: string; theirInsight: string; theirName: string;
  }>();

  // Fallback demo data
  const question = p.question || "What's the hardest decision you've made this month?";
  const yourScore = parseFloat(p.yourScore || '7.4');
  const theirScore = parseFloat(p.theirScore || '6.2');
  const yourInsight = p.yourInsight || 'Strong opening, tight structure.';
  const theirInsight = p.theirInsight || 'Good example but buried the lesson.';
  const theirName = p.theirName || 'Alex';
  const youWin = yourScore > theirScore;
  const tie = yourScore === theirScore;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.pillRow}>
          <View style={s.pill}><Text style={s.pillText}>⚔️ Sharp Duel</Text></View>
        </View>

        <View style={s.qBox}><Text style={s.qText}>"{question}"</Text></View>

        <View style={[s.winBadge, tie ? s.tieBadge : youWin ? s.youWinBadge : s.loseBadge]}>
          <Text style={[s.winText, tie ? s.tieText : youWin ? s.youWinText : s.loseText]}>
            {tie ? '🤝 Tie' : youWin ? '🏆 You win this round' : `${theirName} wins this round`}
          </Text>
        </View>

        <View style={s.vsCard}>
          <View style={s.vsRow}>
            {/* You */}
            <View style={s.player}>
              <Text style={s.playerName}>You</Text>
              <Text style={[s.playerScore, { color: getScoreColor(yourScore) }]}>{yourScore.toFixed(1)}</Text>
              <View style={s.bar}><View style={[s.barFill, { width: `${yourScore * 10}%`, backgroundColor: getScoreColor(yourScore) }]} /></View>
              <Text style={s.playerInsight}>"{yourInsight}"</Text>
            </View>

            <Text style={s.vs}>vs</Text>

            {/* Opponent */}
            <View style={s.player}>
              <Text style={s.playerName}>{theirName}</Text>
              <Text style={[s.playerScore, { color: getScoreColor(theirScore) }]}>{theirScore.toFixed(1)}</Text>
              <View style={s.bar}><View style={[s.barFill, { width: `${theirScore * 10}%`, backgroundColor: getScoreColor(theirScore) }]} /></View>
              <Text style={s.playerInsight}>"{theirInsight}"</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        <TouchableOpacity style={s.ghostBtn} activeOpacity={0.7}>
          <Text style={s.ghostText}>🔊 Listen to their answer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.duelBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
          <Text style={s.duelBtnText}>⚔️ Rematch tomorrow</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.ghostBtn} activeOpacity={0.7}>
          <Text style={s.ghostText}>📤 Share result</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.ghostBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.7}>
          <Text style={s.ghostText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  pillRow: { alignItems: 'center', marginBottom: spacing.lg },
  pill: { backgroundColor: colors.duel.bg, borderWidth: 1.5, borderColor: colors.duel.border, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(4) },
  pillText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.duel.text },
  qBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  qText: { fontSize: fp(11), color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(18) },
  winBadge: { borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', marginBottom: spacing.md },
  youWinBadge: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder },
  loseBadge: { backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder },
  tieBadge: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border },
  winText: { fontSize: fp(12), fontWeight: typography.weight.heavy },
  youWinText: { color: colors.success },
  loseText: { color: colors.error },
  tieText: { color: colors.accent.primary },
  vsCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.sm },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  player: { flex: 1, alignItems: 'center' },
  playerName: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.tertiary, marginBottom: wp(4) },
  playerScore: { fontSize: fp(38), fontWeight: typography.weight.black, letterSpacing: -1.5 },
  bar: { height: wp(5), backgroundColor: colors.borderLight, borderRadius: wp(3), width: '100%', marginVertical: wp(6), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: wp(3) },
  playerInsight: { fontSize: fp(9), color: colors.text.muted, lineHeight: fp(14), textAlign: 'center', marginTop: wp(4) },
  vs: { fontSize: fp(12), fontWeight: typography.weight.black, color: colors.text.muted },
  divider: { height: 1.5, backgroundColor: colors.borderLight, marginVertical: spacing.lg },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginBottom: spacing.sm },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  duelBtn: { backgroundColor: colors.duel.accent, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  duelBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
});
