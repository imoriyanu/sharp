import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, ConfettiBurst } from '../../src/components/Illustrations';
import { getUserProfile, setOnboarded } from '../../src/services/storage';
import { isPremium } from '../../src/services/premium';
import { trackEvent, Events } from '../../src/services/analytics';

export default function OnboardingWelcome() {
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => { trackEvent(Events.ONBOARDING_COMPLETED); getUserProfile().then(p => { if (p) setName(p.displayName); }); }, []);

  async function finish() {
    await setOnboarded();
    router.replace('/(tabs)');
  }

  const pro = isPremium();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.center}>
          <FadeIn>
            <View style={s.celebRow}>
              {pro && <ConfettiBurst />}
              <SharpFox size={wp(140)} expression={pro ? 'celebrating' : 'happy'} />
            </View>
          </FadeIn>

          <FadeIn delay={400}>
            <Text style={s.heading}>{pro ? "You're Sharp Pro!" : `Welcome, ${name || 'friend'}!`}</Text>
          </FadeIn>

          <FadeIn delay={700}>
            <Text style={s.sub}>
              {pro
                ? 'All features unlocked.\nYour journey to sharper communication starts now.'
                : 'Your first Daily Challenge is waiting.\nCome back every day to build your streak.'}
            </Text>
          </FadeIn>

          <FadeIn delay={1000}>
            <View style={s.tipsCard}>
              <Text style={s.tipsTitle}>Quick tips to get started</Text>
              <View style={s.tipRow}><Text style={s.tipEmoji}>☀️</Text><Text style={s.tipText}>Do the Daily Challenge every day</Text></View>
              <View style={s.tipRow}><Text style={s.tipEmoji}>🎧</Text><Text style={s.tipText}>Listen to model answers after each session</Text></View>
              <View style={s.tipRow}><Text style={s.tipEmoji}>🔥</Text><Text style={s.tipText}>Build a streak — unlock badges along the way</Text></View>
            </View>
          </FadeIn>
        </View>

        <FadeIn delay={1300}>
          <TouchableOpacity style={s.cta} onPress={finish} activeOpacity={0.8}>
            <Text style={s.ctaText}>Let's go!</Text>
          </TouchableOpacity>
          {!pro && (
            <Text style={s.hint}>You can upgrade anytime in Settings</Text>
          )}
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  celebRow: { alignItems: 'center', marginBottom: spacing.xl },
  heading: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary, textAlign: 'center', letterSpacing: -0.5 },
  sub: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(20), marginTop: spacing.md },
  tipsCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', marginTop: spacing.xxl, ...shadows.sm },
  tipsTitle: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.lg },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  tipEmoji: { fontSize: fp(16) },
  tipText: { fontSize: typography.size.sm, color: colors.text.secondary, fontWeight: typography.weight.semibold },
  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  hint: { fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.sm },
});
