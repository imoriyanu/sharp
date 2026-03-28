import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, layout, wp, fp } from '../../src/constants/theme';

const LAST_UPDATED = '28 March 2026';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Privacy Policy</Text>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>
        <Text style={s.updated}>Last updated: {LAST_UPDATED}</Text>

        <Section title="What Sharp Does">
          Sharp is a communication training app that helps you practise speaking clearly and confidently. You record spoken answers, and our AI coaches you on how to improve.
        </Section>

        <Section title="What We Collect">
          {`• Audio recordings — sent to our servers for transcription, then deleted. We do not store your audio files.
• Transcripts of your spoken answers — used to generate coaching feedback. Stored locally on your device and optionally synced to your account.
• Your context (role, company, situation) — stored locally and optionally synced to your account to personalise coaching.
• Documents you upload (CV, job descriptions) — parsed for coaching context, stored locally and optionally synced.
• Session scores and coaching history — stored locally and optionally synced.
• Usage data (session counts, feature usage) — to enforce plan limits.
• Email address — if you create an account.`}
        </Section>

        <Section title="How We Use Your Data">
          {`• To transcribe your audio (via Groq/Whisper)
• To generate coaching feedback (via Anthropic/Claude)
• To generate text-to-speech audio (via ElevenLabs)
• To personalise questions to your role and industry
• To track your progress over time
• To enforce usage limits on your plan`}
        </Section>

        <Section title="Third-Party Services">
          {`We use the following services to process your data:
• Anthropic (Claude) — AI coaching and scoring
• Groq (Whisper) — Audio transcription
• ElevenLabs — Text-to-speech
• Supabase — Account storage and sync
• Railway — Backend hosting

Your audio is sent to Groq for transcription and immediately deleted after processing. Your transcripts are sent to Anthropic for scoring. These services process your data under their own privacy policies.`}
        </Section>

        <Section title="Data Storage">
          {`All coaching data (scores, transcripts, context) is stored locally on your device using AsyncStorage. If you create an account, this data is synced to Supabase (hosted in the EU) so it persists across devices.

You can delete all your data at any time from Settings > Clear All Data.`}
        </Section>

        <Section title="What We Don't Do">
          {`• We don't sell your data to anyone
• We don't use your data to train AI models
• We don't share your data with advertisers
• We don't store your audio recordings
• We don't track your location
• We don't access your contacts or photos (except profile picture, if you choose)`}
        </Section>

        <Section title="Your Rights">
          {`You can:
• View all your data in the app (History, Context, Settings)
• Delete all your data from Settings > Clear All Data
• Request a copy of your data by emailing us
• Delete your account by emailing us

For data requests, contact: privacy@sharp-app.com`}
        </Section>

        <Section title="Children">
          Sharp is not intended for children under 13. We do not knowingly collect data from children.
        </Section>

        <Section title="Changes">
          We may update this policy. We'll notify you of significant changes through the app. Continued use after changes constitutes acceptance.
        </Section>

        <Section title="Contact">
          {`For privacy questions:
Email: privacy@sharp-app.com`}
        </Section>

        <View style={{ height: wp(40) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBody}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },
  updated: { fontSize: typography.size.xs, color: colors.text.muted, marginBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.sm },
  sectionBody: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },
});
