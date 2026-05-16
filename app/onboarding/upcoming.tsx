import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { saveUpcomingEvent, getActiveUpcomingEvents, deleteUpcomingEvent } from '../../src/services/storage';
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

// Reverse: given an ISO date, compute days from today (local midnight). Used
// to reconstruct the matching WHEN chip when prefilling from an existing
// saved event. Timezone-safe via local-midnight regex (matches storage.ts
// daysUntilEvent convention).
function daysFromEventDate(dateStr: string): number | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function OnboardingUpcoming() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<UpcomingEventType | null>(null);
  const [selectedWhen, setSelectedWhen] = useState<typeof WHEN_OPTIONS[number]['id'] | null>(null);
  const [saving, setSaving] = useState(false);
  // If the user already saved an event on a previous pass through this
  // screen, hold its id so the next save goes down the update path in
  // storage.ts instead of creating a duplicate active event.
  const [existingEventId, setExistingEventId] = useState<string | null>(null);

  const canSave = selectedType !== null && selectedWhen !== null && !saving;

  // Runs on every screen focus, not just mount. Two jobs:
  //  1. Recover stuck UI state: if the user navigated back mid-save, the
  //     `saving` flag would have stayed true and the CTA would be locked
  //     showing "Saving…". Reset it so the button is usable again.
  //  2. Prefill from any existing active event so the user sees their
  //     previous selection (not a blank form) and so handleSave can route
  //     to the update path.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setSaving(false);
    getActiveUpcomingEvents().then(events => {
      if (cancelled || events.length === 0) return;
      // Dedupe legacy duplicates. Onboarding should produce exactly one event;
      // if we see more, the user came through an older build that created a
      // new event on every save instead of updating the existing one. Keep
      // the most recently created (by createdAt) and delete the rest. Safe
      // here because OnboardingGate guarantees the user is mid-onboarding,
      // and /upcoming/new (the only other event-creation path) is not
      // reachable until onboarding completes.
      let keeper = events[0];
      if (events.length > 1) {
        const sorted = [...events].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        keeper = sorted[0];
        for (const stale of sorted.slice(1)) {
          deleteUpcomingEvent(stale.id).catch(() => {});
        }
      }
      setExistingEventId(keeper.id);
      setSelectedType(keeper.type);
      const dayDiff = daysFromEventDate(keeper.eventDate);
      if (dayDiff !== null) {
        const when = WHEN_OPTIONS.find(w => w.days === dayDiff);
        if (when) setSelectedWhen(when.id);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  async function handleSave() {
    if (!canSave || !selectedType || !selectedWhen) return;
    setSaving(true);
    const typeOpt = TYPE_OPTIONS.find(t => t.id === selectedType)!;
    const whenOpt = WHEN_OPTIONS.find(w => w.id === selectedWhen)!;
    try {
      const saved = await saveUpcomingEvent({
        // Pass id when we already have one so storage.ts updates the existing
        // event rather than creating a duplicate. Fixes the bug where editing
        // type/when and re-saving produced a second active event that
        // getActiveUpcomingEvents would return stale-first.
        ...(existingEventId ? { id: existingEventId } : {}),
        type: selectedType,
        title: typeOpt.defaultTitle,
        eventDate: dateFromOffsetDays(whenOpt.days),
      });
      if (saved) {
        setExistingEventId(saved.id);
        trackEvent(existingEventId ? 'upcoming_event_updated' : 'upcoming_event_created', { source: 'onboarding', type: selectedType, when: selectedWhen });
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
    } finally {
      // Belt-and-braces. Even though useFocusEffect would reset this on the
      // next focus, clearing here means the CTA reverts to "Save & continue"
      // before navigation animates, avoiding a flash of "Saving…" on the way
      // out.
      setSaving(false);
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
