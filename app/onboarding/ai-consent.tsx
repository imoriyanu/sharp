import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { setAIConsent } from '../../src/services/storage';

export default function AIConsentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();

  async function handleAllow() {
    await setAIConsent();
    const next = typeof params.next === 'string' ? params.next : '/onboarding/recording';
    router.replace(next as any);
  }

  function handleDeny() {
    router.replace('/onboarding');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={s.eyebrow}>Permission required</Text>
          <Text style={s.title}>Allow Sharp to share your voice and text with AI providers?</Text>
        </FadeIn>

        <FadeIn delay={150}>
          <View style={s.block}>
            <Text style={s.blockLabel}>What is sent</Text>
            <Text style={s.blockBody}>Your voice recordings, the transcripts of those recordings, and any text or files you choose to upload (such as a CV or job description).</Text>
          </View>

          <View style={s.block}>
            <Text style={s.blockLabel}>Who it is sent to</Text>
            <Text style={s.blockBody}>
              <Text style={s.strong}>Anthropic</Text> (scoring + coaching feedback),{' '}
              <Text style={s.strong}>Groq</Text> (audio transcription),{' '}
              <Text style={s.strong}>ElevenLabs</Text> and{' '}
              <Text style={s.strong}>Together AI</Text> (text-to-speech for question playback).
            </Text>
          </View>

          <View style={s.block}>
            <Text style={s.blockLabel}>How it is protected</Text>
            <Text style={s.blockBody}>All four providers operate under zero-retention API terms. Your data is processed and discarded — it is not stored on their servers and is not used to train their AI models. Your audio is also deleted from Sharp's servers immediately after transcription.</Text>
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={6} style={s.policyRow}>
            <Text style={s.policyText}>Read the full Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={s.footnote}>You can revoke this at any time by deleting your account in Settings.</Text>
        </FadeIn>

        <View style={s.spacer} />

        <FadeIn delay={450}>
          <TouchableOpacity style={s.allowBtn} onPress={handleAllow} activeOpacity={0.85}>
            <Text style={s.allowText}>Allow</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.denyBtn} onPress={handleDeny} activeOpacity={0.85}>
            <Text style={s.denyText}>Don't allow</Text>
          </TouchableOpacity>
          <Text style={s.denyHint}>If you don't allow this, Sharp can't transcribe, score, or play back your practice sessions.</Text>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(24), paddingTop: wp(12), flexGrow: 1 },

  eyebrow: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.accent.primary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  title: { fontSize: fp(22), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5, lineHeight: fp(28), marginBottom: spacing.lg },

  block: { marginBottom: spacing.lg },
  blockLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.text.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
  blockBody: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(21) },
  strong: { fontWeight: typography.weight.semibold, color: colors.text.primary },

  policyRow: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  policyText: { fontSize: typography.size.xs, color: colors.text.secondary, textDecorationLine: 'underline', fontWeight: typography.weight.semibold },
  footnote: { fontSize: typography.size.xs, color: colors.text.muted, lineHeight: fp(18), marginTop: spacing.xs },

  spacer: { flex: 1, minHeight: spacing.xl },

  allowBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center' },
  allowText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },

  denyBtn: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.accent.border },
  denyText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary },
  denyHint: { fontSize: typography.size.xs, color: colors.text.muted, lineHeight: fp(18), marginTop: spacing.sm, textAlign: 'center' },
});
