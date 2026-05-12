// @ts-nocheck — feature disabled for MVP; references symbols not yet wired in. See src/constants/features.ts.
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { addConversationCredits, getConversationCredits } from '../../src/services/premium';

const PACKS = [
  { id: '3_pack', count: 3, price: '£4.99', perSession: '£1.66', popular: false },
  { id: '10_pack', count: 10, price: '£14.99', perSession: '£1.50', popular: true },
];

export default function ConversationPurchaseScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState('10_pack');
  const [purchasing, setPurchasing] = useState(false);
  const [credits, setCredits] = useState(0);

  useState(() => { getConversationCredits().then(setCredits); });

  async function handlePurchase() {
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pack = PACKS.find(p => p.id === selected);
    if (!pack) return;

    // TODO: Integrate with RevenueCat consumable IAP
    // For now, add credits directly (replace with real purchase flow)
    try {
      await addConversationCredits(pack.count);
      const newCredits = await getConversationCredits();
      setCredits(newCredits);
      Alert.alert('Credits added', `You now have ${newCredits} conversation credit${newCredits !== 1 ? 's' : ''}.`, [
        { text: 'Start a conversation', onPress: () => router.replace('/conversation/setup') },
        { text: 'Later', style: 'cancel', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Purchase failed', 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <FadeIn>
          <View style={s.hero}>
            <Text style={s.heroEmoji}>💬</Text>
            <Text style={s.heroTitle}>Conversation Practice</Text>
            <Text style={s.heroSub}>Live voice conversations with AI characters. Practice interviews, negotiations, feedback, and more.</Text>
            {credits > 0 && (
              <View style={s.creditsBadge}>
                <Text style={s.creditsText}>{credits} credit{credits !== 1 ? 's' : ''} remaining</Text>
              </View>
            )}
          </View>
        </FadeIn>

        <FadeIn delay={200}>
          <Text style={s.section}>Choose a pack</Text>
          {PACKS.map(pack => (
            <TouchableOpacity
              key={pack.id}
              style={[s.packCard, selected === pack.id && s.packSelected]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelected(pack.id); }}
              activeOpacity={0.7}
            >
              <View style={s.packLeft}>
                <View style={[s.radio, selected === pack.id && s.radioOn]}>
                  {selected === pack.id && <View style={s.radioDot} />}
                </View>
                <View>
                  <Text style={[s.packTitle, selected === pack.id && s.packTitleActive]}>{pack.count} conversations</Text>
                  <Text style={s.packPerSession}>{pack.perSession} each</Text>
                </View>
              </View>
              <Text style={[s.packPrice, selected === pack.id && s.packPriceActive]}>{pack.price}</Text>
              {pack.popular && (
                <View style={s.popularBadge}><Text style={s.popularText}>Best value</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </FadeIn>

        <FadeIn delay={400}>
          <View style={s.scenariosCard}>
            <Text style={s.scenariosTitle}>5 scenarios included</Text>
            <Text style={s.scenarioItem}>💼 Job Interview — nail the tough questions</Text>
            <Text style={s.scenarioItem}>💰 Salary Negotiation — know what to say</Text>
            <Text style={s.scenarioItem}>🎯 Difficult Feedback — direct without destructive</Text>
            <Text style={s.scenarioItem}>🛡 Stakeholder Pushback — hold your ground</Text>
            <Text style={s.scenarioItem}>🚀 Elevator Pitch — hook them in 60 seconds</Text>
          </View>
        </FadeIn>

        <View style={s.footer}>
          <TouchableOpacity style={[s.buyBtn, purchasing && s.buyBtnDisabled]} onPress={handlePurchase} disabled={purchasing} activeOpacity={0.8}>
            <Text style={s.buyText}>{purchasing ? 'Processing...' : `Buy ${PACKS.find(p => p.id === selected)?.count} conversations`}</Text>
            <Text style={s.buySub}>{PACKS.find(p => p.id === selected)?.price} · one-time purchase</Text>
          </TouchableOpacity>

          {credits > 0 && (
            <TouchableOpacity style={s.useBtn} onPress={() => router.replace('/conversation/setup')} activeOpacity={0.7}>
              <Text style={s.useText}>Use existing credits ({credits})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  backBtn: { marginBottom: spacing.lg },
  backText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroEmoji: { fontSize: fp(40), marginBottom: spacing.md },
  heroTitle: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  heroSub: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20), paddingHorizontal: spacing.lg },
  creditsBadge: { backgroundColor: colors.feedback.positiveBg, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5), marginTop: spacing.md },
  creditsText: { fontSize: fp(11), fontWeight: typography.weight.bold, color: colors.success },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },

  packCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.sm },
  packSelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.light },
  packLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  radio: { width: wp(20), height: wp(20), borderRadius: wp(10), borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent.primary },
  radioDot: { width: wp(10), height: wp(10), borderRadius: wp(5), backgroundColor: colors.accent.primary },
  packTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  packTitleActive: { color: colors.accent.primary },
  packPerSession: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 1 },
  packPrice: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.primary },
  packPriceActive: { color: colors.accent.primary },
  popularBadge: { position: 'absolute', top: -wp(10), right: wp(16), backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  popularText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.inverse },

  scenariosCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, ...shadows.sm },
  scenariosTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.md },
  scenarioItem: { fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(20), marginBottom: spacing.xs },

  footer: { marginTop: 'auto', paddingTop: spacing.lg },
  buyBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent },
  buyBtnDisabled: { opacity: 0.6 },
  buyText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  buySub: { fontSize: fp(10), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },
  useBtn: { paddingVertical: spacing.lg, alignItems: 'center' },
  useText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary },
});
