import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { trackFeatureInterest } from '../../src/services/storage';

export default function AnalyticsComingSoon() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.icon}><Text style={s.iconEmoji}>📊</Text></View>
        <Text style={s.title}>Progress Analytics</Text>
        <Text style={s.badge}>Coming Soon</Text>

        <Text style={s.desc}>
          Score trends, dimension breakdowns, streak stats, and patterns across all your sessions.
        </Text>

        <View style={s.features}>
          {['Score trends over time', 'Weakest dimension tracking', 'Filler word reduction graph', 'Weekly and monthly reports'].map(f => (
            <View key={f} style={s.feat}>
              <View style={s.featDot} />
              <Text style={s.featText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={s.spacer} />

        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => trackFeatureInterest('progress_analytics')}
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
  container: { flex: 1, padding: layout.screenPadding, alignItems: 'center', paddingTop: spacing.xxl },
  icon: { width: wp(52), height: wp(52), borderRadius: wp(18), backgroundColor: colors.bg.tertiary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  iconEmoji: { fontSize: fp(22) },
  spacer: { flex: 1 },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  badge: { fontSize: fp(9), fontWeight: typography.weight.heavy, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: wp(3), marginBottom: spacing.xl },
  desc: { fontSize: fp(11), color: colors.text.secondary, textAlign: 'center', lineHeight: fp(18), marginBottom: spacing.xl },
  features: { width: '100%', marginBottom: spacing.xl },
  feat: { flexDirection: 'row', alignItems: 'center', gap: wp(8), paddingVertical: wp(4) },
  featDot: { width: wp(5), height: wp(5), borderRadius: wp(3), backgroundColor: colors.border },
  featText: { fontSize: fp(11), color: colors.text.secondary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center' },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
