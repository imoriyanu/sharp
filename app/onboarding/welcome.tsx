import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
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
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View style={s.celebRow}>
            {pro && <ConfettiBurst />}
            <SharpFox size={wp(110)} expression={pro ? 'celebrating' : 'happy'} />
          </View>
        </FadeIn>

        <FadeIn delay={400}>
          <Text style={s.heading}>{pro ? "You're Sharp Pro!" : `You're in, ${name || 'friend'}.`}</Text>
        </FadeIn>

        <FadeIn delay={700}>
          <Text style={s.sub}>
            {pro
              ? 'Full access unlocked. Deep practice, pressure rounds, and full coaching. It all starts now.'
              : 'Your first Daily Challenge is ready. Show up every day, speak for 30 seconds, and watch yourself get sharper.'}
          </Text>
        </FadeIn>

        <FadeIn delay={1000}>
          <View style={s.tipsCard}>
            <Text style={s.tipsTitle}>YOUR GAME PLAN</Text>

            <View style={s.tipRow}>
              <View style={s.tipNum}><Text style={s.tipNumText}>1</Text></View>
              <View style={s.tipContent}>
                <Text style={s.tipTitle}>{pro ? 'Do the Daily Challenge' : 'Do the Daily Challenge'}</Text>
                <Text style={s.tipDesc}>{pro ? '60 seconds a day builds real muscle memory' : '60 seconds a day — the question is free for everyone'}</Text>
              </View>
            </View>

            <View style={s.tipRow}>
              <View style={s.tipNum}><Text style={s.tipNumText}>2</Text></View>
              <View style={s.tipContent}>
                <Text style={s.tipTitle}>{pro ? 'Try a One Shot' : 'Try your free One Shot'}</Text>
                <Text style={s.tipDesc}>{pro ? 'Full scoring, coaching, and a model answer — 3 per day' : 'You get 1 full scored session per day — see how you compare'}</Text>
              </View>
            </View>

            <View style={s.tipRow}>
              <View style={s.tipNum}><Text style={s.tipNumText}>3</Text></View>
              <View style={s.tipContent}>
                <Text style={s.tipTitle}>Build your streak</Text>
                <Text style={s.tipDesc}>Consistency beats intensity every time</Text>
              </View>
            </View>
          </View>
        </FadeIn>
      </ScrollView>

      <FadeIn delay={1300}>
        <View style={s.footer}>
          <TouchableOpacity style={s.cta} onPress={finish} activeOpacity={0.8}>
            <Text style={s.ctaText}>Start training</Text>
          </TouchableOpacity>
          {!pro && <Text style={s.hint}>Upgrade anytime in Settings</Text>}
        </View>
      </FadeIn>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { flexGrow: 1, padding: layout.screenPadding, justifyContent: 'center' },

  celebRow: { alignItems: 'center', marginBottom: spacing.md },

  heading: {
    fontSize: fp(28),
    fontWeight: typography.weight.black,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fp(20),
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },

  tipsCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xl,
    ...shadows.md,
  },
  tipsTitle: {
    fontSize: fp(9),
    fontWeight: typography.weight.black,
    color: colors.accent.primary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tipNum: {
    width: wp(28),
    height: wp(28),
    borderRadius: wp(14),
    backgroundColor: colors.accent.light,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent.border,
  },
  tipNumText: {
    fontSize: fp(12),
    fontWeight: typography.weight.black,
    color: colors.accent.primary,
  },
  tipContent: { flex: 1 },
  tipTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  tipDesc: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    marginTop: 2,
    lineHeight: fp(16),
  },

  footer: { padding: layout.screenPadding, paddingTop: spacing.sm },
  cta: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.accent,
  },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  hint: { fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.sm },
});
