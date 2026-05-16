import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { saveUpcomingEvent } from '../../src/services/storage';
import { trackEvent } from '../../src/services/analytics';
import type { UpcomingEventType } from '../../src/types';

// Same picker grids as onboarding/upcoming.tsx. Duplicated intentionally , 
// the two screens serve different flows (mandatory onboarding step vs.
// in-app add) so future divergence is easier.
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

export default function NewUpcomingEvent() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<UpcomingEventType | null>(null);
  const [selectedWhen, setSelectedWhen] = useState<typeof WHEN_OPTIONS[number]['id'] | null>(null);
  const [description, setDescription] = useState('');
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
        description: description.trim() || undefined,
      });
      if (!saved) {
        // Cap hit. Re-enable Save so user can cancel and try again later.
        Alert.alert(
          'Already tracking 3 events',
          'Remove one from Coming Up to add a new one. Sharp keeps you focused on the conversations that matter most.',
          [{ text: 'OK' }]
        );
        return;
      }
      trackEvent('upcoming_event_created', { source: 'in_app', type: selectedType, when: selectedWhen });
      try {
        router.replace(`/upcoming/${saved.id}`);
      } catch (navErr) {
        // Navigation failed but event saved. Fall back to a plain back so the
        // user sees their new event on Home rather than getting stuck here.
        __DEV__ && console.warn('upcoming/new: nav after save failed', navErr);
        router.back();
      }
    } catch (e: any) {
      // Storage write failed (rare. AsyncStorage full, disk full, etc).
      // Don't leave the user stranded. Explain what happened.
      __DEV__ && console.warn('upcoming/new: save failed', e?.message || e);
      trackEvent('upcoming_event_save_failed', { source: 'in_app', error: String(e?.message || e).slice(0, 200) });
      Alert.alert(
        'Couldn\'t save',
        'We hit a snag saving that. Try again in a moment. Your selection is preserved.',
        [{ text: 'OK' }]
      );
    } finally {
      // Always re-enable Save so the UI never sticks in a permanently
      // disabled state, regardless of which branch we took above.
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={s.headerBack}>{'< Back'}</Text>
          </TouchableOpacity>
        </View>

        <FadeIn>
          <Text style={s.heading}>What's coming up?</Text>
          <Text style={s.subheading}>
            We'll bias every practice session toward this. Up to 3 active events.
          </Text>
        </FadeIn>

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
          <Text style={s.whenHint}>You can edit the exact date on the detail screen.</Text>
        </FadeIn>

        <FadeIn delay={600}>
          <Text style={s.section}>Anything specific? <Text style={s.optional}>(optional)</Text></Text>
          <TextInput
            style={s.input}
            placeholder='e.g. "Series A pitch to a16z, B2B SaaS"'
            placeholderTextColor={colors.text.muted}
            value={description}
            onChangeText={setDescription}
            maxLength={200}
            multiline
          />
          <Text style={s.inputHint}>The more specific, the more relevant your practice gets.</Text>
        </FadeIn>

        <FadeIn delay={800}>
          <TouchableOpacity
            style={[s.cta, !canSave && s.ctaDisabled]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={!canSave}
          >
            <Text style={s.ctaText}>{saving ? 'Saving…' : 'Add event'}</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  kav: { flex: 1 },
  content: { padding: layout.screenPadding, paddingBottom: wp(40) },

  header: { marginBottom: spacing.lg },
  headerBack: { fontSize: typography.size.sm, color: colors.text.tertiary, fontWeight: typography.weight.semibold },

  heading: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5 },
  subheading: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.xs, lineHeight: fp(20), marginBottom: spacing.lg },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.lg, marginBottom: spacing.md },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: wp(6), backgroundColor: colors.bg.secondary, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(9), borderWidth: 1.5, borderColor: 'transparent', ...shadows.sm },
  typeChipSelected: { backgroundColor: colors.accent.light, borderColor: colors.accent.primary, ...shadows.accent },
  typeEmoji: { fontSize: fp(14) },
  typeLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.secondary },
  typeLabelSelected: { color: colors.accent.primary, fontWeight: typography.weight.bold },
  typeCheck: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.accent.primary, marginLeft: wp(2) },

  whenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  whenChip: { backgroundColor: colors.bg.secondary, borderRadius: radius.pill, paddingHorizontal: wp(16), paddingVertical: wp(9), borderWidth: 1.5, borderColor: 'transparent', ...shadows.sm },
  whenChipSelected: { backgroundColor: colors.accent.light, borderColor: colors.accent.primary, ...shadows.accent },
  whenLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.secondary },
  whenLabelSelected: { color: colors.accent.primary, fontWeight: typography.weight.bold },
  whenHint: { fontSize: fp(10), color: colors.text.muted, marginTop: spacing.sm, fontStyle: 'italic' as const },

  optional: { fontWeight: typography.weight.regular, color: colors.text.muted, textTransform: 'none' as const, letterSpacing: 0 },
  input: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.size.sm, color: colors.text.primary, minHeight: wp(70), textAlignVertical: 'top', borderWidth: 1.5, borderColor: colors.borderLight },
  inputHint: { fontSize: fp(10), color: colors.text.muted, marginTop: spacing.xs },

  cta: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', marginTop: spacing.xl, ...shadows.accent },
  ctaDisabled: { opacity: 0.4, ...shadows.sm },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
