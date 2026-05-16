import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { saveUpcomingEvent } from '../../src/services/storage';
import { trackEvent } from '../../src/services/analytics';
import type { UpcomingEventType } from '../../src/types';

// 8 event type presets + Other. Each carries a default title and the emoji we
// use across the product so the Home card / detail screen stay consistent.
type TypeOption = { id: UpcomingEventType; label: string; defaultTitle: string; emoji: string };
const TYPE_OPTIONS: TypeOption[] = [
  { id: 'interview',      label: 'Job interview',         defaultTitle: 'Job interview',            emoji: '💼' },
  { id: 'pitch',          label: 'Pitch / investor',      defaultTitle: 'Investor pitch',           emoji: '🚀' },
  { id: 'raise',          label: 'Asking for a raise',    defaultTitle: 'Raise conversation',       emoji: '💰' },
  { id: 'review',         label: 'Performance review',    defaultTitle: 'Performance review',       emoji: '📋' },
  { id: 'feedback',       label: 'Tough feedback',        defaultTitle: 'Feedback conversation',    emoji: '🎯' },
  { id: 'sales',          label: 'Sales / client',        defaultTitle: 'Client meeting',           emoji: '🤝' },
  { id: 'presentation',   label: 'Presentation / talk',   defaultTitle: 'Presentation',             emoji: '🎤' },
  { id: 'difficult_convo',label: 'Difficult conversation',defaultTitle: 'Difficult conversation',   emoji: '💬' },
  { id: 'other',          label: 'Something else',        defaultTitle: 'Big conversation',         emoji: '✨' },
];

// Quick-pick date offsets. Each option computes a real ISO date from today.
// Keeps onboarding fast. No native datepicker required. Detail screen can
// edit to a precise date later.
const WHEN_OPTIONS = [
  { id: 'this_week',   label: 'This week',  days: 3 },
  { id: 'next_week',   label: 'Next week',  days: 7 },
  { id: 'two_weeks',   label: 'In 2 weeks', days: 14 },
  { id: 'one_month',   label: 'In 1 month', days: 30 },
  { id: 'two_months',  label: 'In 2 months',days: 60 },
  { id: 'three_months',label: 'In 3 months',days: 90 },
];

function dateFromOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function OnboardingUpcoming() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<UpcomingEventType | null>(null);
  const [selectedWhen, setSelectedWhen] = useState<typeof WHEN_OPTIONS[number]['id'] | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = selectedType !== null && selectedWhen !== null && !saving;

  async function handleSave() {
    if (!canSave || !selectedType || !selectedWhen) return;
    setSaving(true);
    const typeOpt = TYPE_OPTIONS.find(t => t.id === selectedType)!;
    const whenOpt = WHEN_OPTIONS.find(w => w.id === selectedWhen)!;
    try {
      const saved = await saveUpcomingEvent({
        type: selectedType,
        title: typeOpt.defaultTitle,
        eventDate: dateFromOffsetDays(whenOpt.days),
      });
      if (saved) {
        trackEvent('upcoming_event_created', { source: 'onboarding', type: selectedType, when: selectedWhen });
      } else {
        // Cap-hit shouldn't happen during onboarding (no prior events) but
        // guard for restored backups. Track for visibility.
        trackEvent('upcoming_event_save_skipped', { source: 'onboarding', reason: 'cap_or_corrupt' });
      }
    } catch (e: any) {
      // Storage write failed. Don't block onboarding (event is recoverable , 
      // user can re-add from Home later) but log so we can spot a pattern.
      __DEV__ && console.warn('onboarding/upcoming: save failed', e?.message || e);
      trackEvent('upcoming_event_save_failed', { source: 'onboarding', error: String(e?.message || e).slice(0, 200) });
    }
    // Always advance to the challenge intro. The next step uses the event
    // we just saved to personalise the first recording. If save failed, the
    // challenge-intro falls back to the generic question.
    router.push('/onboarding/challenge-intro');
  }

  function handleSkip() {
    trackEvent('upcoming_event_skipped', { source: 'onboarding' });
    router.push('/onboarding/challenge-intro');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={s.label}>Before we start</Text>
          <Text style={s.heading}>What's the conversation{'\n'}you're prepping for?</Text>
          <Text style={s.subheading}>
            The one that actually matters in the next 90 days. We'll shape your first practice around it.
          </Text>
        </FadeIn>

        {/* Type picker */}
        <FadeIn delay={200}>
          <Text style={s.section}>What kind?</Text>
          <View style={s.chipGrid}>
            {TYPE_OPTIONS.map((opt) => {
              const selected = selectedType === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.typeChip, selected && s.typeChipSelected]}
                  onPress={() => setSelectedType(opt.id)}
                  activeOpacity={0.75}
                >
                  <Text style={s.typeEmoji}>{opt.emoji}</Text>
                  <Text style={[s.typeLabel, selected && s.typeLabelSelected]}>{opt.label}</Text>
                  {selected && <Text style={s.typeCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* When picker */}
        <FadeIn delay={400}>
          <Text style={s.section}>When?</Text>
          <View style={s.whenRow}>
            {WHEN_OPTIONS.map((opt) => {
              const selected = selectedWhen === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.whenChip, selected && s.whenChipSelected]}
                  onPress={() => setSelectedWhen(opt.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.whenLabel, selected && s.whenLabelSelected]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.whenHint}>You can edit the exact date later.</Text>
        </FadeIn>

        {/* Actions */}
        <FadeIn delay={600}>
          <TouchableOpacity
            style={[s.cta, !canSave && s.ctaDisabled]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={!canSave}
          >
            <Text style={s.ctaText}>{saving ? 'Saving…' : 'Save & continue'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={s.skipRow}>
            <Text style={s.skipText}>I don't have one right now</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(40) },

  label: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.accent.primary, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  heading: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.6, lineHeight: fp(34), marginBottom: spacing.sm },
  subheading: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), marginBottom: spacing.xl },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.lg, marginBottom: spacing.md },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: wp(14), paddingVertical: wp(9),
    borderWidth: 1.5, borderColor: 'transparent',
    ...shadows.sm,
  },
  typeChipSelected: { backgroundColor: colors.accent.light, borderColor: colors.accent.primary, ...shadows.accent },
  typeEmoji: { fontSize: fp(14) },
  typeLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.secondary },
  typeLabelSelected: { color: colors.accent.primary, fontWeight: typography.weight.bold },
  typeCheck: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.accent.primary, marginLeft: wp(2) },

  whenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  whenChip: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: wp(16), paddingVertical: wp(9),
    borderWidth: 1.5, borderColor: 'transparent',
    ...shadows.sm,
  },
  whenChipSelected: { backgroundColor: colors.accent.light, borderColor: colors.accent.primary, ...shadows.accent },
  whenLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.secondary },
  whenLabelSelected: { color: colors.accent.primary, fontWeight: typography.weight.bold },
  whenHint: { fontSize: fp(10), color: colors.text.muted, marginTop: spacing.sm, fontStyle: 'italic' as const },

  cta: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(18),
    alignItems: 'center',
    marginTop: spacing.xl,
    ...shadows.accent,
  },
  ctaDisabled: { opacity: 0.4, ...shadows.sm },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  skipRow: { paddingVertical: spacing.lg, alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },
});
