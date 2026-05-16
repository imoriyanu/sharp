import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble, ProgressDots } from '../../src/components/Illustrations';
import { getActiveUpcomingEvents } from '../../src/services/storage';
import {
  ONBOARDING_QUESTION_BY_TYPE,
  ONBOARDING_QUESTION_FALLBACK,
  ONBOARDING_QUESTION_FRAMING_BY_TYPE,
  ONBOARDING_QUESTION_FRAMING_FALLBACK,
} from '../../src/constants/onboarding-questions';

export default function ChallengeIntro() {
  const router = useRouter();
  // Resolved question + framing. Depend on whether the user picked an
  // upcoming event in the previous step. Start with fallback so the screen
  // never renders empty while we resolve from AsyncStorage.
  const [question, setQuestion] = useState(ONBOARDING_QUESTION_FALLBACK);
  const [framing, setFraming] = useState(ONBOARDING_QUESTION_FRAMING_FALLBACK);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getActiveUpcomingEvents().then(events => {
      if (!mountedRef.current) return;
      const first = events[0];
      if (first) {
        setQuestion(ONBOARDING_QUESTION_BY_TYPE[first.type] || ONBOARDING_QUESTION_FALLBACK);
        setFraming(ONBOARDING_QUESTION_FRAMING_BY_TYPE[first.type] || ONBOARDING_QUESTION_FRAMING_FALLBACK);
      }
    }).catch(() => {
      // Fall back to generic. Already set as initial state.
    });
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <ProgressDots total={5} current={2} />

        <View style={s.center}>
          <FadeIn delay={200}>
            <SharpFox size={wp(100)} expression="listening" />
          </FadeIn>

          <FadeIn delay={500}>
            <SpeechBubble text="Let's see what you've got. Answer one question and I'll score you across 5 dimensions instantly." variant="accent" />
          </FadeIn>

          <FadeIn delay={900}>
            <View style={s.detailsCard}>
              <Text style={s.detailsLabel}>YOUR FIRST CHALLENGE</Text>
              <Text style={s.detailsQuestion}>"{question}"</Text>
              <Text style={s.detailsContext}>{framing}</Text>

              <View style={s.metaRow}>
                <View style={s.metaItem}>
                  <Text style={s.metaValue}>30s</Text>
                  <Text style={s.metaLabel}>to speak</Text>
                </View>
                <View style={s.metaDivider} />
                <View style={s.metaItem}>
                  <Text style={s.metaValue}>5</Text>
                  <Text style={s.metaLabel}>scores</Text>
                </View>
                <View style={s.metaDivider} />
                <View style={s.metaItem}>
                  <Text style={s.metaValue}>AI</Text>
                  <Text style={s.metaLabel}>feedback</Text>
                </View>
              </View>
            </View>
          </FadeIn>
        </View>

        <FadeIn delay={1300}>
          <TouchableOpacity style={s.cta} onPress={() => router.push({ pathname: '/onboarding/recording', params: { question } })} activeOpacity={0.8}>
            <Text style={s.ctaText}>Start speaking</Text>
          </TouchableOpacity>
          <Text style={s.hint}>Speak naturally, there are no wrong answers</Text>
        </FadeIn>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding, paddingTop: wp(12) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },

  detailsCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    ...shadows.md,
  },
  detailsLabel: {
    fontSize: fp(9),
    fontWeight: typography.weight.black,
    color: colors.accent.primary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  detailsQuestion: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    lineHeight: fp(24),
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  detailsContext: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    lineHeight: fp(16),
    marginBottom: spacing.lg,
  },

  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flex: 1, alignItems: 'center' },
  metaDivider: { width: 1, height: wp(24), backgroundColor: colors.borderLight },
  metaValue: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.accent.primary },
  metaLabel: { fontSize: fp(9), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginTop: 2 },

  cta: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.accent,
  },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  hint: { fontSize: fp(10), color: colors.text.muted, textAlign: 'center', marginBottom: wp(12) },
});
