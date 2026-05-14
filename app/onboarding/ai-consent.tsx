import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { setAIConsent } from '../../src/services/storage';

const PROVIDERS = [
  { name: 'Anthropic (Claude)', purpose: 'Scoring your answers and generating coaching insights' },
  { name: 'Groq (Whisper)', purpose: 'Transcribing your voice recordings to text' },
  { name: 'ElevenLabs', purpose: 'Reading questions aloud so practice feels real' },
  { name: 'Together AI (Kokoro)', purpose: 'Backup text-to-speech for question audio' },
];

export default function AIConsentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();

  async function handleContinue() {
    await setAIConsent();
    const next = typeof params.next === 'string' ? params.next : '/onboarding/recording';
    router.replace(next as any);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={s.title}>Sharp uses AI to coach you</Text>
          <Text style={s.subtitle}>Before you start, here's exactly what we send and to whom — so you can decide.</Text>
        </FadeIn>

        <FadeIn delay={150}>
          <View style={s.section}>
            <Text style={s.sectionLabel}>WHAT WE SEND</Text>
            <View style={s.card}>
              <Text style={s.cardItem}>• Your voice recording when you practise</Text>
              <Text style={s.cardItem}>• The transcript of what you said</Text>
              <Text style={s.cardItem}>• Any text you type as context (role, goals)</Text>
              <Text style={s.cardItem}>• Documents you choose to upload (e.g. your CV)</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <View style={s.section}>
            <Text style={s.sectionLabel}>WHO WE SEND IT TO</Text>
            <View style={s.card}>
              {PROVIDERS.map((p, i) => (
                <View key={p.name} style={[s.providerRow, i < PROVIDERS.length - 1 && s.providerRowBorder]}>
                  <Text style={s.providerName}>{p.name}</Text>
                  <Text style={s.providerPurpose}>{p.purpose}</Text>
                </View>
              ))}
            </View>
            <Text style={s.protectionNote}>All providers operate under zero-retention API terms — your data is not stored after processing and is never used to train their models.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={450}>
          <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={6} style={s.policyRow}>
            <Text style={s.policyText}>Read the full Privacy Policy →</Text>
          </TouchableOpacity>
        </FadeIn>

        <FadeIn delay={600}>
          <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={s.continueText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.denyBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.denyText}>Don't allow</Text>
          </TouchableOpacity>
          <Text style={s.footnote}>You can revoke consent any time by deleting your account in Settings.</Text>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40), paddingTop: wp(12) },

  title: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), marginBottom: spacing.xl },

  section: { marginBottom: spacing.xl },
  sectionLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, letterSpacing: 1.5, marginBottom: spacing.sm },

  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm },
  cardItem: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(22) },

  providerRow: { paddingVertical: spacing.sm },
  providerRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  providerName: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  providerPurpose: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginTop: 2 },

  protectionNote: { fontSize: typography.size.xs, color: colors.text.muted, lineHeight: fp(18), marginTop: spacing.sm, fontStyle: 'italic' },

  policyRow: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.md },
  policyText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary, textDecorationLine: 'underline' },

  continueBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', ...shadows.accent },
  continueText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },

  denyBtn: { alignItems: 'center', paddingVertical: spacing.lg },
  denyText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },

  footnote: { fontSize: fp(11), color: colors.text.muted, textAlign: 'center', lineHeight: fp(16), marginTop: spacing.sm, paddingHorizontal: spacing.md },
});
