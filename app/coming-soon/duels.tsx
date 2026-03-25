import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { trackFeatureInterest } from '../../src/services/storage';

export default function DuelsComingSoon() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.icon}><Text style={s.iconEmoji}>⚔️</Text></View>
        <Text style={s.title}>Sharp Duels</Text>
        <Text style={s.badge}>Coming Soon</Text>

        <Text style={s.desc}>
          Challenge friends to answer the same question. Compare scores, listen to each other's answers, and see who communicates sharper.
        </Text>

        <View style={s.features}>
          {['Same question, head-to-head', 'Async — record on your own time', 'Side-by-side score comparison', 'Listen to their answer after', 'Share results with friends'].map(f => (
            <View key={f} style={s.feat}>
              <View style={s.featDot} />
              <Text style={s.featText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={s.spacer} />

        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => { trackFeatureInterest('sharp_duels'); }}
          activeOpacity={0.8}
        >
          <Text style={s.mainBtnText}>🔔 Notify me when available</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.ghostText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, alignItems: 'center', paddingTop: wp(60) },
  icon: { width: wp(56), height: wp(56), borderRadius: wp(18), backgroundColor: colors.duel.bg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  iconEmoji: { fontSize: fp(24) },
  spacer: { flex: 1 },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  badge: { fontSize: fp(9), fontWeight: typography.weight.heavy, color: colors.duel.text, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: wp(3), marginBottom: spacing.xl },
  desc: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), marginBottom: spacing.xl },
  features: { width: '100%', marginBottom: spacing.xl },
  feat: { flexDirection: 'row', alignItems: 'center', gap: wp(8), paddingVertical: wp(5) },
  featDot: { width: wp(5), height: wp(5), borderRadius: wp(3), backgroundColor: colors.duel.accent },
  featText: { fontSize: typography.size.sm, color: colors.text.secondary },
  mainBtn: { backgroundColor: colors.duel.accent, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center', shadowColor: colors.duel.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 18 },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), width: '100%', alignItems: 'center', marginTop: spacing.sm },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
