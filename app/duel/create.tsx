import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { generateId } from '../../src/services/storage';

export default function DuelCreateScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ question: string; score: string }>();
  const score = parseFloat(p.score || '0');
  const shareToken = generateId();
  const shareUrl = `sharp.app/duel/${shareToken}`;

  async function copyLink() {
    await Clipboard.setStringAsync(shareUrl);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.iconBox}><Text style={s.iconEmoji}>⚔️</Text></View>
        <Text style={s.title}>Duel sent</Text>
        <Text style={s.sub}>Waiting for opponent</Text>

        <TouchableOpacity style={s.linkBox} onPress={copyLink} activeOpacity={0.7}>
          <Text style={s.linkUrl} numberOfLines={1}>{shareUrl}</Text>
          <Text style={s.linkCopy}>Copy</Text>
        </TouchableOpacity>

        <View style={s.scoreBox}>
          <Text style={[s.scoreNum, { color: getScoreColor(score) }]}>{score.toFixed(1)}</Text>
          <Text style={s.scoreLbl}>Your score</Text>
        </View>

        <View style={s.questionBox}>
          <Text style={s.questionText}>"{p.question}"</Text>
        </View>

        <View style={s.spacer} />

        <TouchableOpacity style={s.ghostBtn} onPress={copyLink} activeOpacity={0.7}>
          <Text style={s.ghostText}>📤 Share link again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.7}>
          <Text style={s.ghostText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, alignItems: 'center', paddingTop: spacing.xxl },
  iconBox: { width: wp(56), height: wp(56), borderRadius: wp(20), backgroundColor: colors.duel.bg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  iconEmoji: { fontSize: fp(24) },
  spacer: { flex: 1 },
  title: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: wp(3) },
  sub: { fontSize: fp(11), color: colors.text.muted, marginBottom: spacing.xl },
  linkBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: wp(6), width: '100%', marginBottom: spacing.lg },
  linkUrl: { flex: 1, fontSize: fp(10), color: colors.text.tertiary },
  linkCopy: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  scoreBox: { backgroundColor: colors.bg.secondary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', width: '100%', marginBottom: spacing.lg, ...shadows.sm },
  scoreNum: { fontSize: fp(28), fontWeight: typography.weight.black, letterSpacing: -1 },
  scoreLbl: { fontSize: fp(9), color: colors.text.muted, fontWeight: typography.weight.bold, marginTop: 1 },
  questionBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, width: '100%' },
  questionText: { fontSize: fp(10), color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(16) },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), width: '100%', alignItems: 'center', marginBottom: spacing.sm },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
