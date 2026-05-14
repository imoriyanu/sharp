import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { setAIConsent } from '../../src/services/storage';

export default function AIConsentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();

  async function handleContinue() {
    await setAIConsent();
    const next = typeof params.next === 'string' ? params.next : '/onboarding/recording';
    router.replace(next as any);
  }

  function handleDeny() {
    Alert.alert(
      'Sharp needs this to coach you',
      'Without this, the app can\'t transcribe, score, or play back questions. You can come back any time.',
      [
        { text: 'Cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => router.replace('/onboarding') },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={s.title}>A note before you start</Text>
          <Text style={s.body}>
            Sharp uses AI to coach you. Your voice recording, transcript, and any text or files you choose to upload are processed by{' '}
            <Text style={s.bodyStrong}>Anthropic</Text>,{' '}
            <Text style={s.bodyStrong}>Groq</Text>,{' '}
            <Text style={s.bodyStrong}>ElevenLabs</Text>, and{' '}
            <Text style={s.bodyStrong}>Together AI</Text>
            {' '}— all under zero-retention API terms, so nothing is stored after processing or used to train their models.
          </Text>
          <Text style={s.footnote}>You can revoke this any time by deleting your account in Settings.</Text>
        </FadeIn>

        <FadeIn delay={300}>
          <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={6} style={s.policyRow}>
            <Text style={s.policyText}>Read the full Privacy Policy</Text>
          </TouchableOpacity>
        </FadeIn>

        <View style={s.spacer} />

        <FadeIn delay={450}>
          <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={s.continueText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.denyBtn} onPress={handleDeny} activeOpacity={0.7} hitSlop={6}>
            <Text style={s.denyText}>Don't allow</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40), paddingTop: wp(20), flexGrow: 1 },

  title: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5, marginBottom: spacing.md },
  body: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(22) },
  bodyStrong: { fontWeight: typography.weight.semibold, color: colors.text.primary },
  footnote: { fontSize: typography.size.xs, color: colors.text.muted, lineHeight: fp(18), marginTop: spacing.md },

  policyRow: { alignSelf: 'flex-start', paddingVertical: spacing.md },
  policyText: { fontSize: typography.size.xs, color: colors.text.muted, textDecorationLine: 'underline' },

  spacer: { flex: 1, minHeight: spacing.xl },

  continueBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center' },
  continueText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },

  denyBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  denyText: { fontSize: typography.size.xs, fontWeight: typography.weight.regular, color: colors.text.muted },
});
