import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FEATURES } from '../../src/constants/features';
import { FadeIn } from '../../src/components/Animations';

const PACK_FEATURES = [
  { icon: '⚡', title: '15 One Shot sessions', desc: 'Custom questions from your CV + job description' },
  { icon: '⚓', title: '3 Threaded Challenges', desc: '4-turn pressure drills that escalate like real interviews' },
  ...(FEATURES.conversation ? [{ icon: '💬', title: '5 Conversation sessions', desc: 'Live voice practice with AI interviewers' }] : []),
  { icon: '📄', title: 'Document upload', desc: 'Upload your CV and job description for personalised questions' },
  { icon: '⏱', title: '30 days access', desc: 'Use your sessions anytime within 30 days' },
];

export default function InterviewPackScreen() {
  const router = useRouter();
  const [purchasing, setPurchasing] = useState(false);

  async function handlePurchase() {
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // TODO: Integrate with RevenueCat non-consumable IAP
    try {
      Alert.alert('Coming soon', 'Interview Pack will be available shortly. Subscribe to Pro for full access now.', [
        { text: 'Get Pro', onPress: () => router.replace('/premium') },
        { text: 'Later', style: 'cancel' },
      ]);
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <FadeIn>
          <View style={s.hero}>
            <Text style={s.heroEmoji}>💼</Text>
            <Text style={s.heroTitle}>Interview Pack</Text>
            <Text style={s.heroSub}>Everything you need to nail your next interview. One purchase, 30 days of focused practice.</Text>
            <View style={s.priceBadge}>
              <Text style={s.priceText}>£29.99</Text>
              <Text style={s.priceLabel}>one-time purchase</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={200}>
          <Text style={s.section}>What's included</Text>
          {PACK_FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <View style={s.featureInfo}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </FadeIn>

        <FadeIn delay={400}>
          <View style={s.compareCard}>
            <Text style={s.compareTitle}>Interview Pack vs Pro subscription</Text>
            <View style={s.compareRow}>
              <Text style={s.compareLabel}>Interview Pack</Text>
              <Text style={s.compareValue}>£29.99 once · targeted prep</Text>
            </View>
            <View style={s.compareRow}>
              <Text style={s.compareLabel}>Sharp Pro</Text>
              <Text style={s.compareValue}>£19.99/mo · unlimited everything</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={600}>
          <TouchableOpacity style={[s.buyBtn, purchasing && s.buyBtnDisabled]} onPress={handlePurchase} disabled={purchasing} activeOpacity={0.8}>
            <Text style={s.buyText}>{purchasing ? 'Processing...' : 'Buy Interview Pack, £29.99'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.proBtn} onPress={() => router.replace('/premium')} activeOpacity={0.7}>
            <Text style={s.proText}>Or get unlimited with Pro →</Text>
          </TouchableOpacity>
        </FadeIn>

        <View style={{ height: wp(30) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  backBtn: { marginBottom: spacing.lg },
  backText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroEmoji: { fontSize: fp(40), marginBottom: spacing.md },
  heroTitle: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  heroSub: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), paddingHorizontal: spacing.md },
  priceBadge: { backgroundColor: colors.accent.primary, borderRadius: radius.xl, paddingHorizontal: wp(24), paddingVertical: wp(12), marginTop: spacing.lg, alignItems: 'center' },
  priceText: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.inverse },
  priceLabel: { fontSize: fp(10), color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },

  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm },
  featureIcon: { fontSize: fp(18), marginTop: 2 },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  featureDesc: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2, lineHeight: fp(16) },

  compareCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xl, ...shadows.sm },
  compareTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.md },
  compareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  compareLabel: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.primary },
  compareValue: { fontSize: typography.size.xs, color: colors.text.muted },

  buyBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent },
  buyBtnDisabled: { opacity: 0.6 },
  buyText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  proBtn: { paddingVertical: spacing.lg, alignItems: 'center' },
  proText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary },
});
