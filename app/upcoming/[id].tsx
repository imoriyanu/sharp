import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import {
  getUpcomingEventById,
  deleteUpcomingEvent,
  markEventPassed,
  saveUpcomingEvent,
  daysUntilEvent,
  getEventReadiness,
} from '../../src/services/storage';
import { isPremium, canDoOneShot, canDoThreaded } from '../../src/services/premium';
import type { UpcomingEvent } from '../../src/types';

const EVENT_EMOJI: Record<string, string> = {
  interview: '💼', pitch: '🚀', raise: '💰', review: '📋',
  feedback: '🎯', sales: '🤝', presentation: '🎤', difficult_convo: '💬', other: '✨',
};

// Practice queue recommendation per event type. Maps the event to which
// modes are most useful + a short rationale. Bias toward whichever scenario
// generator best simulates the real conversation type.
const RECOMMENDED_PRACTICE: Record<string, { mode: 'one_shot' | 'threaded'; title: string; reason: string }[]> = {
  interview: [
    { mode: 'threaded',  title: 'Pressure rounds',  reason: 'Real interviews follow up. Practice holding the line across 4 turns.' },
    { mode: 'one_shot',  title: 'Tell me about yourself', reason: '90-second pitch you will absolutely be asked.' },
  ],
  pitch: [
    { mode: 'threaded',  title: 'Pitch Q&A',         reason: 'Investor questions land in sequence. Recover under pressure.' },
    { mode: 'one_shot',  title: 'Open with the hook',reason: 'Land the first 30 seconds before logistics.' },
  ],
  raise: [
    { mode: 'threaded',  title: 'Pushback drills',   reason: 'Your manager will push back. Practice not folding.' },
    { mode: 'one_shot',  title: 'The opening ask',   reason: 'Lead with the number. Practice not burying it.' },
  ],
  review: [
    { mode: 'threaded',  title: 'Performance Q&A',   reason: 'Show evidence + take feedback under pressure.' },
    { mode: 'one_shot',  title: 'Achievement story', reason: 'Specific moment, specific impact, specific number.' },
  ],
  feedback: [
    { mode: 'threaded',  title: 'Emotional pivots',  reason: 'They will react. Stay present, stay specific.' },
    { mode: 'one_shot',  title: 'The opening line',  reason: 'Land it cleanly without over-padding.' },
  ],
  sales: [
    { mode: 'threaded',  title: 'Objection handling',reason: 'Their concerns land back-to-back. Don\'t lose the room.' },
    { mode: 'one_shot',  title: 'Pitch the value',   reason: 'One specific outcome, one specific number.' },
  ],
  presentation: [
    { mode: 'one_shot',  title: 'The opening',       reason: 'Audiences decide in the first 60 seconds.' },
    { mode: 'threaded',  title: 'Q&A after',         reason: 'Questions are where speakers fall apart.' },
  ],
  difficult_convo: [
    { mode: 'threaded',  title: 'Stay present',      reason: 'Their reaction will test you. Don\'t fix, just listen.' },
    { mode: 'one_shot',  title: 'The opening',       reason: 'Acknowledge the thing without theatrics.' },
  ],
  other: [
    { mode: 'one_shot',  title: 'Find your point',   reason: 'Lead with substance. Cut the run-up.' },
    { mode: 'threaded',  title: 'Pressure rounds',   reason: 'Whatever the topic, holding ground matters.' },
  ],
};

function bandColor(band: 'red' | 'amber' | 'green'): string {
  if (band === 'green') return colors.success;
  if (band === 'amber') return colors.daily.text;
  return colors.error;
}

// Countdown label for the detail-screen hero pill. More descriptive than
// the Home variant because there's more space (full screen, big chip).
function eventCountdownLabel(days: number): string {
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days away`;
}

// Safe date formatter. Returns a graceful fallback if the date string is
// malformed rather than rendering "Invalid Date" to the user.
function formatEventDate(eventDate: string): string {
  if (!eventDate) return '';
  // Parse local-midnight to avoid timezone drift in toLocaleDateString.
  const m = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return eventDate; // fall back to raw rather than "Invalid Date"
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  if (isNaN(d.getTime())) return eventDate;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function UpcomingEventDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<UpcomingEvent | null>(null);
  const [readiness, setReadiness] = useState<{ score: number; band: 'red' | 'amber' | 'green'; sessionsForEvent: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const mountedRef = useRef(true);

  // Reload on focus so edits (e.g. via Alert + saveUpcomingEvent) reflect.
  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    if (id) {
      getUpcomingEventById(id).then(e => {
        if (!mountedRef.current) return;
        if (e) {
          setEvent(e);
          // Guard readiness setState. Readiness scoring touches multiple
          // AsyncStorage reads and can finish after the user navigates away.
          getEventReadiness(e).then(r => {
            if (mountedRef.current) setReadiness(r);
          }).catch((err) => {
            __DEV__ && console.warn('detail: readiness failed', err);
            // Leave readiness null so the UI renders ", " rather than stale.
          });
        } else {
          setNotFound(true);
        }
      }).catch((err) => {
        __DEV__ && console.warn('detail: event load failed', err);
        if (mountedRef.current) setNotFound(true);
      });
    } else {
      setNotFound(true);
    }
    return () => { mountedRef.current = false; };
  }, [id]));

  async function handlePractice(mode: 'one_shot' | 'threaded') {
    if (mode === 'threaded' && !isPremium()) { router.push('/premium'); return; }
    const check = mode === 'one_shot' ? await canDoOneShot() : await canDoThreaded();
    if (!check.allowed) {
      Alert.alert(
        mode === 'one_shot' ? 'One Shot limit reached' : 'Threaded limit reached',
        isPremium() ? 'Resets tomorrow.' : 'Upgrade to Pro for more practice.',
        [{ text: 'OK' }]
      );
      return;
    }
    router.push(mode === 'threaded' ? '/one-shot/question?mode=threaded' : '/one-shot/question');
  }

  function handleDelete() {
    if (!event) return;
    Alert.alert(
      'Remove this event?',
      `"${event.title}" will be removed from Coming Up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteUpcomingEvent(event.id);
            router.back();
          },
        },
      ]
    );
  }

  function handleMarkPassed() {
    if (!event) return;
    Alert.alert(
      'How did it go?',
      'We\'ll log the outcome and clear this from your Coming Up.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Bombed',   onPress: async () => { await markEventPassed(event.id, 'bombed'); router.back(); } },
        { text: 'Went okay',onPress: async () => { await markEventPassed(event.id, 'okay');   router.back(); } },
        { text: 'Aced it',  onPress: async () => { await markEventPassed(event.id, 'aced');   router.back(); } },
      ]
    );
  }

  // Quick-edit description via Alert.prompt (iOS). Keeps the screen lean. The
  // full date picker lives in a future screen iteration.
  function handleEditDescription() {
    if (!event) return;
    Alert.prompt(
      'Describe it',
      'Make it specific, "Series A pitch to a16z, B2B SaaS"',
      async (text) => {
        if (text === null) return; // cancelled
        const updated = await saveUpcomingEvent({ ...event, description: text.trim() || undefined });
        if (updated) setEvent(updated);
      },
      'plain-text',
      event.description || ''
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.notFoundText}>Event not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return <SafeAreaView style={s.safe}><View style={s.centered}><Text style={s.notFoundText}>Loading…</Text></View></SafeAreaView>;
  }

  const days = daysUntilEvent(event.eventDate);
  const fillWidth = readiness ? `${Math.min(readiness.score * 10, 100)}%` : '0%';
  const fillColor = readiness ? bandColor(readiness.band) : colors.borderLight;
  const recommendations = RECOMMENDED_PRACTICE[event.type] || RECOMMENDED_PRACTICE.other;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={s.headerBack}>{'< Back'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} hitSlop={12}>
            <Text style={s.headerDelete}>Remove</Text>
          </TouchableOpacity>
        </View>

        {/* Hero. Emoji in a tinted circle (echoes the rest of Sharp's
            iconography), then title, then date + chip-style countdown. */}
        <FadeIn>
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <Text style={s.heroEmoji}>{EVENT_EMOJI[event.type] || '✨'}</Text>
            </View>
            <Text style={s.title}>{event.title}</Text>
            <Text style={s.dateLine}>{formatEventDate(event.eventDate)}</Text>
            <View style={s.countdownChip}>
              <Text style={s.countdownText}>{eventCountdownLabel(days)}</Text>
            </View>
          </View>
        </FadeIn>

        {/* Description (editable). Empty state more inviting. */}
        <FadeIn delay={100}>
          <TouchableOpacity style={[s.descCard, !event.description && s.descCardEmpty]} onPress={handleEditDescription} activeOpacity={0.7}>
            <View style={s.descHeader}>
              <Text style={s.descLabel}>Specifics</Text>
              <Text style={s.descEdit}>{event.description ? 'Edit' : 'Add'}</Text>
            </View>
            <Text style={[s.descText, !event.description && s.descTextEmpty]}>
              {event.description || 'Add specifics, "Series A pitch to a16z, B2B SaaS". So Sharp tailors every scenario to it.'}
            </Text>
          </TouchableOpacity>
        </FadeIn>

        {/* Readiness. Premium gauge feel. Score top-right, full-width bar,
            color-coded copy underneath that names the band. */}
        <FadeIn delay={200}>
          <View style={s.readinessCard}>
            <View style={s.readinessHeader}>
              <View>
                <Text style={s.readinessLabel}>READINESS</Text>
                <Text style={s.readinessSubLabel}>How prepared you are right now</Text>
              </View>
              <View style={s.readinessScoreWrap}>
                <Text style={[s.readinessScore, { color: fillColor }]}>
                  {readiness ? readiness.score.toFixed(1) : '-'}
                </Text>
                <Text style={s.readinessOutOf}>/ 10</Text>
              </View>
            </View>
            <View style={s.readinessBarTrack}>
              <View style={[s.readinessBarFill, { width: fillWidth as any, backgroundColor: fillColor }]} />
            </View>
            <View style={[s.readinessBandRow, { backgroundColor: `${fillColor}15` }]}>
              <View style={[s.readinessBandDot, { backgroundColor: fillColor }]} />
              <Text style={[s.readinessBandText, { color: fillColor }]}>
                {readiness && readiness.band === 'green' ? 'Solid prep. Keep the pressure on.' :
                 readiness && readiness.band === 'amber' ? 'Halfway there. A few more sessions and you\'ll feel it.' :
                 'Get started. Every session moves this up.'}
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* Practice queue. What we recommend before the event */}
        <Text style={s.section}>Recommended practice</Text>
        <FadeIn delay={300}>
          {recommendations.map((rec, i) => (
            <TouchableOpacity
              key={`${rec.mode}-${i}`}
              style={s.recCard}
              onPress={() => handlePractice(rec.mode)}
              activeOpacity={0.88}
            >
              <View style={[s.recIconWrap, rec.mode === 'threaded' && s.recIconWrapThreaded]}>
                <Text style={s.recIcon}>{rec.mode === 'threaded' ? '⚓' : '⚡'}</Text>
              </View>
              <View style={s.recLeft}>
                <View style={s.recHeader}>
                  <Text style={s.recMode}>{rec.mode === 'threaded' ? 'Threaded' : 'One Shot'}</Text>
                  <Text style={s.recDot}>·</Text>
                  <Text style={s.recDuration}>{rec.mode === 'threaded' ? '5-8 min' : '2-3 min'}</Text>
                </View>
                <Text style={s.recTitle}>{rec.title}</Text>
                <Text style={s.recReason}>{rec.reason}</Text>
              </View>
              <Text style={s.recArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </FadeIn>

        {/* If the event is past, surface the "mark how it went" action prominently */}
        {days <= 0 && (
          <FadeIn delay={400}>
            <TouchableOpacity style={s.outcomeBtn} onPress={handleMarkPassed} activeOpacity={0.85}>
              <Text style={s.outcomeBtnText}>How did it go?</Text>
              <Text style={s.outcomeBtnSub}>Log the outcome and clear this from Coming Up.</Text>
            </TouchableOpacity>
          </FadeIn>
        )}

        <View style={{ height: wp(40) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(20) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  notFoundText: { fontSize: typography.size.sm, color: colors.text.muted },
  backBtn: { marginTop: spacing.md },
  backBtnText: { color: colors.accent.primary, fontWeight: typography.weight.bold as any },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  headerBack: { fontSize: typography.size.sm, color: colors.text.tertiary, fontWeight: typography.weight.semibold },
  headerDelete: { fontSize: typography.size.xs, color: colors.error, fontWeight: typography.weight.bold },

  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroIconWrap: {
    width: wp(80), height: wp(80), borderRadius: wp(24),
    backgroundColor: colors.accent.light,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1.5, borderColor: colors.accent.border,
  },
  heroEmoji: { fontSize: fp(36) },
  title: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary, textAlign: 'center', letterSpacing: -0.5 },
  dateLine: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.xs, fontWeight: typography.weight.semibold },
  countdownChip: {
    marginTop: spacing.md,
    backgroundColor: colors.accent.primary,
    borderRadius: radius.pill,
    paddingHorizontal: wp(14), paddingVertical: wp(6),
    ...shadows.accent,
  },
  countdownText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.text.inverse, letterSpacing: 0.3 },

  descCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  descCardEmpty: { backgroundColor: colors.bg.tertiary, borderWidth: 1.5, borderColor: colors.borderLight, borderStyle: 'dashed' as const, shadowOpacity: 0 },
  descHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  descLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.2 },
  descEdit: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.bold },
  descText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontStyle: 'italic' },
  descTextEmpty: { color: colors.text.tertiary, fontStyle: 'normal' as const },

  readinessCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.md },
  readinessHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.md },
  readinessLabel: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  readinessSubLabel: { fontSize: fp(10), color: colors.text.muted, marginTop: 2 },
  readinessScoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  readinessScore: { fontSize: fp(28), fontWeight: typography.weight.black, letterSpacing: -1 },
  readinessOutOf: { fontSize: typography.size.xs, color: colors.text.muted, fontWeight: typography.weight.semibold },
  readinessBarTrack: { height: wp(10), backgroundColor: colors.borderLight, borderRadius: wp(5), overflow: 'hidden' },
  readinessBarFill: { height: '100%', borderRadius: wp(5) },
  readinessBandRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  readinessBandDot: { width: wp(8), height: wp(8), borderRadius: wp(4) },
  readinessBandText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, flex: 1, lineHeight: fp(18) },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md, marginTop: spacing.md },

  recCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  recIconWrap: {
    width: wp(44), height: wp(44), borderRadius: wp(14),
    backgroundColor: colors.accent.light,
    alignItems: 'center', justifyContent: 'center',
  },
  recIconWrapThreaded: { backgroundColor: colors.feedback.positiveBg },
  recIcon: { fontSize: fp(20) },
  recLeft: { flex: 1 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  recMode: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.accent.primary, textTransform: 'uppercase' as const, letterSpacing: 1 },
  recDot: { fontSize: fp(10), color: colors.text.muted },
  recDuration: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.muted },
  recTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  recReason: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 3, lineHeight: fp(17) },
  recArrow: { fontSize: typography.size.md, color: colors.accent.primary, fontWeight: typography.weight.bold },

  outcomeBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', marginTop: spacing.md, ...shadows.accent },
  outcomeBtnText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  outcomeBtnSub: { fontSize: fp(10), color: colors.text.inverse, opacity: 0.8, marginTop: 2 },
});
