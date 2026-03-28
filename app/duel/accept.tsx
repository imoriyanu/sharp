import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';

export default function DuelAcceptScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.pill}><Text style={s.pillText}>⚔️ Sharp Duel</Text></View>

        <View style={s.avi}><Text style={s.aviEmoji}>👋</Text></View>
        <Text style={s.name}>Sarah challenged you</Text>
        <Text style={s.sub}>Same question · 30 seconds each</Text>

        <View style={s.qBox}><Text style={s.qText}>"What's the hardest decision you've made this month, and what did you learn?"</Text></View>

        <Text style={s.hidden}>Their score is hidden until you record</Text>

        <Text style={s.timer}>0:30</Text>
        <Text style={s.ready}>READY</Text>

        <View style={s.spacer} />

        <TouchableOpacity style={s.mainBtn} onPress={() => router.push('/daily/challenge')} activeOpacity={0.8}>
          <Text style={s.mainText}>🎤 Accept & record</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.ghostText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, alignItems: 'center', paddingTop: spacing.xxl },
  pill: { backgroundColor: colors.duel.bg, borderWidth: 1.5, borderColor: colors.duel.border, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(4), marginBottom: spacing.xl },
  pillText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.duel.text },
  avi: { width: wp(44), height: wp(44), borderRadius: wp(22), backgroundColor: colors.duel.bg, borderWidth: 2, borderColor: colors.duel.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  aviEmoji: { fontSize: fp(18) },
  spacer: { flex: 1 },
  name: { fontSize: fp(14), fontWeight: typography.weight.heavy, color: colors.text.primary, marginBottom: 2 },
  sub: { fontSize: fp(10), color: colors.text.muted, marginBottom: spacing.xl },
  qBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, width: '100%', marginBottom: spacing.md },
  qText: { fontSize: fp(11), color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(18) },
  hidden: { fontSize: fp(9), color: colors.text.muted, marginBottom: spacing.lg },
  timer: { fontSize: fp(48), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -2 },
  ready: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, letterSpacing: 1, marginBottom: spacing.xl },
  mainBtn: { backgroundColor: colors.duel.accent, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), width: '100%', alignItems: 'center' },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
