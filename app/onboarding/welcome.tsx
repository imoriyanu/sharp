import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, ConfettiBurst } from '../../src/components/Illustrations';
import { getUserProfile, setOnboarded, getActiveUpcomingEvents, daysUntilEvent } from '../../src/services/storage';
import { isPremium } from '../../src/services/premium';
import { trackEvent, Events } from '../../src/services/analytics';

export default function OnboardingWelcome() {
  const router = useRouter();
  const [name, setName] = useState('');
  // Days until the user's primary upcoming event. Used to tie the durable
  // promise to a specific countdown. Null = no event set (user skipped),
  // in which case we render the copy without the event sentence.
  const [eventDays, setEventDays] = useState<number | null>(null);

  useEffect(() => {
    getUserProfile().then(p => { if (p) setName(p.displayName); });
    getActiveUpcomingEvents().then(events => {
      const first = events[0];
      if (first) {
        const d = daysUntilEvent(first.eventDate);
        if (d >= 0) setEventDays(d);
      }
    }).catch(() => {
      // No event saved or storage failed. Render the no-event variant.
    });
  }, []);

  async function finish() {
    trackEvent(Events.ONBOARDING_COMPLETED);
    await setOnboarded();
    router.replace('/(tabs)');
  }

  const pro = isPremium();
  const heading = pro ? "You're Sharp Pro." : `You're in, ${name || 'friend'}.`;
  // The durable promise, "coaching compounds". Sets the right expectation
  // (depth comes with use) and prevents day-3 churn from users expecting
  // instant transformation. Tied to their event when one is set.
  const eventLine =
    eventDays === null ? ''
    : eventDays === 0 ? ' Your event is today.'
    : eventDays === 1 ? ' Your event is tomorrow.'
    : ` Your event is in ${eventDays} days.`;
  const body = `Sharp learns how you speak across sessions. By your third session, the coaching starts catching your patterns.${eventLine} Let's get to work.`;

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
          <Text style={s.heading}>{heading}</Text>
        </FadeIn>

        <FadeIn delay={700}>
          <Text style={s.body}>{body}</Text>
        </FadeIn>
      </ScrollView>

      <FadeIn delay={1100}>
        <View style={s.footer}>
          <TouchableOpacity style={s.cta} onPress={finish} activeOpacity={0.8}>
            <Text style={s.ctaText}>Start practicing</Text>
            <Text style={s.ctaArrow}>→</Text>
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

  celebRow: { alignItems: 'center', marginBottom: spacing.lg },

  heading: {
    fontSize: fp(28),
    fontWeight: typography.weight.black,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fp(24),
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },

  footer: { padding: layout.screenPadding, paddingTop: spacing.sm },
  cta: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    marginBottom: spacing.sm,
    ...shadows.accent,
  },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaArrow: { fontSize: typography.size.md, color: colors.text.inverse, opacity: 0.7 },
  hint: { fontSize: typography.size.xs, color: colors.text.muted, textAlign: 'center', paddingVertical: spacing.sm },
});
