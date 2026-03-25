import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { trackFeatureInterest } from '../../src/services/storage';

export default function ConversationComingSoon() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.icon}><Text style={s.iconEmoji}>💬</Text></View>
        <Text style={s.title}>Conversation Practice</Text>
        <Text style={s.badge}>Coming Soon</Text>

        <Text style={s.desc}>
          Practice full voice conversations with an AI that plays your interviewer, manager, or promotion panellist.
        </Text>

        <View style={s.features}>
          {['Real-time voice back-and-forth', 'Adaptive follow-up questions', 'Adjustable difficulty levels', 'Full conversation debrief'].map(f => (
            <View key={f} style={s.feat}>
              <View style={s.featDot} />
              <Text style={s.featText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={s.spacer} />

        <TouchableOpacity
          style={s.mainBtn}
          onPress={() => { trackFeatureInterest('conversation_practice'); }}
          activeOpacity={0.8}
        >
          <Text style={s.mainBtnText}>🔔 Notify me when available</Text>
        </TouchableOpacity>

        <View style={s.divider} />
        <Text style={s.altText}>Try a Threaded Challenge — it trains the same follow-up skills.</Text>
        <TouchableOpacity
          style={s.ghostBtn}
          onPress={() => { router.dismiss(); router.push('/one-shot/question?mode=threaded'); }}
          activeOpacity={0.7}
        >
          <Text style={s.ghostText}>Start Threaded Challenge</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, alignItems: 'center', paddingTop: wp(60) },
  icon: { width: wp(52), height: wp(52), borderRadius: wp(18), backgroundColor: colors.bg.tertiary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  iconEmoji: { fontSize: fp(22) },
  spacer: { flex: 1 },
  title: { fontSize: fp(20), fontWeight: typography.weight.black, color: colors.text.primary },
  badge: { fontSize: fp(9), fontWeight: typography.weight.heavy, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: wp(3), marginBottom: spacing.xl },
  desc: { fontSize: fp(11), color: colors.text.secondary, textAlign: 'center', lineHeight: fp(18), marginBottom: spacing.xl },
  features: { width: '100%', marginBottom: spacing.xl },
  feat: { flexDirection: 'row', alignItems: 'center', gap: wp(8), paddingVertical: wp(4) },
  featDot: { width: wp(5), height: wp(5), borderRadius: wp(3), backgroundColor: colors.border },
  featText: { fontSize: fp(11), color: colors.text.secondary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), width: '100%', alignItems: 'center', ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  divider: { height: 1.5, backgroundColor: colors.borderLight, width: '100%', marginVertical: spacing.lg },
  altText: { fontSize: fp(10), color: colors.text.muted, textAlign: 'center', lineHeight: fp(16), marginBottom: spacing.md },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), width: '100%', alignItems: 'center' },
  ghostText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
