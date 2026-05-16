import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, ProgressDots } from '../../src/components/Illustrations';
import { playCoachingAudio, playModelAudio, stopAudio } from '../../src/services/tts';

type KeySkill = { skill: string; why: string };

function safeParseSkills(json: string): KeySkill[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(s => s && typeof s === 'object' && typeof s.skill === 'string')
      .map(s => ({ skill: String(s.skill), why: String(s.why || '') }))
      .slice(0, 3);
  } catch { return []; }
}

export default function OnboardingResult() {
  const router = useRouter();
  const p = useLocalSearchParams();

  // Event-aware layer
  const welcomeNote = ((p.welcomeNote as string) || '').trim();
  const startingPoint = ((p.startingPoint as string) || '').trim();
  const whatIHeard = ((p.whatIHeard as string) || '').trim();
  const keySkills = safeParseSkills((p.keySkills as string) || '[]');
  const journeyFraming = ((p.journeyFraming as string) || '').trim();
  const journeyDays = parseInt((p.journeyDays as string) || '');
  const eventTitle = (p.eventTitle as string) || '';
  const eventType = (p.eventType as string) || '';
  const hasEvent = !!eventTitle && eventType && eventType !== 'other';

  // Existing coaching layer (refined work, kept)
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const coachingInsight = (p.coachingInsight as string) || '';
  const modelAnswer = (p.modelAnswer as string) || '';

  // weakestSnippet pieces — rendered inline as the verbatim quote + sharper
  // rewrite block. This is THE conversion moment: the user hears their own
  // words quoted and offered a sharper version.
  const snippetOriginal = ((p.snippetOriginal as string) || '').trim();
  const snippetRewrite = ((p.snippetRewrite as string) || '').trim();
  const snippetExplanation = ((p.snippetExplanation as string) || '').trim();
  const hasSnippet = !!snippetOriginal && !!snippetRewrite;

  const mountedRef = useRef(true);
  // Tracks whichever audio source is currently playing. Drives play/pause UI.
  const [playingKey, setPlayingKey] = useState<'welcome' | 'model' | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    // Auto-play sequence: Sharp greets with welcomeNote, then chains to the
    // model answer (the conversion lever). If welcomeNote is missing (cached
    // old API response), fall back to coachingInsight.
    const greet = welcomeNote || (coachingInsight ? `Here's your first coaching insight. ${coachingInsight}` : '');
    if (greet) {
      setPlayingKey('welcome');
      playCoachingAudio(greet)
        .then(() => {
          if (!mountedRef.current) return;
          setPlayingKey(null);
          if (modelAnswer) {
            setPlayingKey('model');
            const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
            playModelAudio(spokenModel)
              .catch(() => {})
              .finally(() => { if (mountedRef.current) setPlayingKey(null); });
          }
        })
        .catch(() => { if (mountedRef.current) setPlayingKey(null); });
    } else if (modelAnswer) {
      setPlayingKey('model');
      const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
      playModelAudio(spokenModel)
        .catch(() => {})
        .finally(() => { if (mountedRef.current) setPlayingKey(null); });
    }
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function toggleWelcomePlayback() {
    const text = welcomeNote || coachingInsight;
    if (!text) return;
    if (playingKey === 'welcome') { await stopAudio(); setPlayingKey(null); return; }
    await stopAudio();
    if (!mountedRef.current) return;
    setPlayingKey('welcome');
    await playCoachingAudio(text).catch(() => {});
    if (mountedRef.current) setPlayingKey(null);
  }

  async function toggleModelPlayback() {
    if (!modelAnswer) return;
    if (playingKey === 'model') { await stopAudio(); setPlayingKey(null); return; }
    await stopAudio();
    if (!mountedRef.current) return;
    setPlayingKey('model');
    const spokenModel = `Here's what a nine point oh sounds like on this question. ${modelAnswer}`;
    await playModelAudio(spokenModel).catch(() => {});
    if (mountedRef.current) setPlayingKey(null);
  }

  // Journey heading tied to the user's event. Falls back gracefully when no
  // event is set in onboarding.
  const journeyLabel = !hasEvent
    ? `YOUR PATH FORWARD`
    : !isNaN(journeyDays) && journeyDays === 0
      ? `TODAY, BEFORE YOUR ${eventTitle.toUpperCase()}`
      : !isNaN(journeyDays) && journeyDays === 1
        ? `TOMORROW, BEFORE YOUR ${eventTitle.toUpperCase()}`
        : !isNaN(journeyDays) && journeyDays > 0
          ? `${journeyDays} DAYS BEFORE YOUR ${eventTitle.toUpperCase()}`
          : `YOUR PATH TO ${eventTitle.toUpperCase()}`;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <ProgressDots total={5} current={4} />
        </FadeIn>

        {/* Hero. Sharp listening (grounded coach, not celebrating). Below
            the fox: startingPoint narrative — a sentence that locates the
            user's level WITHOUT a number. This is the data point users will
            return to in the Progress dashboard ("when you started, X. Now
            look at where you are."). Replaces the score reveal entirely. */}
        <FadeIn delay={200}>
          <View style={s.heroRow}>
            <SharpFox size={wp(88)} expression="listening" />
            {startingPoint ? (
              <Text style={s.startingPoint}>{startingPoint}</Text>
            ) : null}
          </View>
        </FadeIn>

        {/* Welcome card. Sharp speaks first. Auto-plays. Terracotta border
            marks "Sharp is speaking" — the primary voice moment. */}
        {(welcomeNote || coachingInsight) ? (
          <FadeIn delay={400}>
            <TouchableOpacity style={s.welcomeCard} onPress={toggleWelcomePlayback} activeOpacity={0.85}>
              <View style={s.welcomeHeader}>
                <Text style={s.welcomeLabel}>FROM SHARP</Text>
                <View style={[s.listenChip, playingKey === 'welcome' && s.listenChipActive]}>
                  <Text style={s.listenChipText}>{playingKey === 'welcome' ? '⏸ Pause' : '🔊 Replay'}</Text>
                </View>
              </View>
              <Text style={s.welcomeText}>{welcomeNote || coachingInsight}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* What I heard + the verbatim-quote-with-sharper-rewrite block.
            THIS IS THE CONVERSION MOMENT. The user reads their own words
            quoted back at them with a 4-12 word sharper version. The proof
            that this coach was actually listening. Single combined card so
            the narrative and the snippet read as one beat. */}
        {(whatIHeard || hasSnippet) ? (
          <FadeIn delay={700}>
            <View style={s.heardCard}>
              <Text style={s.heardLabel}>WHAT I HEARD</Text>
              {whatIHeard ? <Text style={s.heardText}>{whatIHeard}</Text> : null}

              {hasSnippet ? (
                <View style={s.snippetBox}>
                  <View style={s.snippetRow}>
                    <Text style={s.snippetTag}>YOU SAID</Text>
                    <Text style={s.snippetOriginal}>"{snippetOriginal}"</Text>
                  </View>
                  <View style={s.snippetDivider} />
                  <View style={s.snippetRow}>
                    <Text style={[s.snippetTag, s.snippetTagSharp]}>SHARPER</Text>
                    <Text style={s.snippetRewrite}>"{snippetRewrite}"</Text>
                  </View>
                  {snippetExplanation ? (
                    <Text style={s.snippetWhy}>{snippetExplanation}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </FadeIn>
        ) : null}

        {/* What landed + Where it slipped — the refined coaching pair,
            kept. Less visual weight than the cards above; reads as the
            evidence-backed beats. */}
        {positives ? (
          <FadeIn delay={1000}>
            <View style={s.positiveCard}>
              <View style={s.coachingHeader}>
                <Text style={s.coachingEmoji}>✓</Text>
                <Text style={s.coachingLabel}>WHAT LANDED</Text>
              </View>
              <Text style={s.coachingText}>{positives}</Text>
            </View>
          </FadeIn>
        ) : null}
        {improvements ? (
          <FadeIn delay={1150}>
            <View style={s.improveCard}>
              <View style={s.coachingHeader}>
                <Text style={[s.coachingEmoji, s.improveEmoji]}>·</Text>
                <Text style={s.coachingLabel}>WHERE IT SLIPPED</Text>
              </View>
              <Text style={s.coachingText}>{improvements}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Focus card. The single muscle to drill first. Amber bg = high
            attention. */}
        {coachingInsight ? (
          <FadeIn delay={1400}>
            <View style={s.focusCard}>
              <View style={s.coachingHeader}>
                <Text style={s.focusEmoji}>💡</Text>
                <Text style={s.focusLabel}>FOCUS ON THIS FIRST</Text>
              </View>
              <Text style={s.focusText}>{coachingInsight}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Journey card. Three keySkills + journeyFraming arc that names
            Sharp features. The "here's how we'll grow together" moment. */}
        {keySkills.length > 0 ? (
          <FadeIn delay={1700}>
            <View style={s.journeyCard}>
              <Text style={s.journeyLabel}>{journeyLabel}</Text>
              <Text style={s.journeyIntro}>
                {hasEvent
                  ? `The three things we'll drill together to get you ready.`
                  : `The three muscles we'll work on together.`}
              </Text>
              {keySkills.map((sk, i) => (
                <View key={i} style={s.skillRow}>
                  <View style={s.skillNum}>
                    <Text style={s.skillNumText}>{i + 1}</Text>
                  </View>
                  <View style={s.skillBody}>
                    <Text style={s.skillTitle}>{sk.skill}</Text>
                    {sk.why ? <Text style={s.skillWhy}>{sk.why}</Text> : null}
                  </View>
                </View>
              ))}
              {journeyFraming ? (
                <View style={s.journeyArc}>
                  <Text style={s.journeyArcText}>{journeyFraming}</Text>
                </View>
              ) : null}
            </View>
          </FadeIn>
        ) : null}

        {/* Model answer. The conversion lever. Auto-plays after welcome. */}
        {modelAnswer ? (
          <FadeIn delay={2000}>
            <TouchableOpacity style={s.modelCard} onPress={toggleModelPlayback} activeOpacity={0.85}>
              <View style={s.modelHeader}>
                <View>
                  <Text style={s.modelLabel}>HERE'S WHAT A 9.0 SOUNDS LIKE</Text>
                  <Text style={s.modelSubLabel}>Built from your response</Text>
                </View>
                <View style={[s.listenChip, s.modelListenChip, playingKey === 'model' && s.listenChipActive]}>
                  <Text style={s.listenChipText}>{playingKey === 'model' ? '⏸ Pause' : '🔊 Listen'}</Text>
                </View>
              </View>
              <Text style={s.modelText}>"{modelAnswer}"</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        <FadeIn delay={2300}>
          <TouchableOpacity style={s.cta} onPress={() => { stopAudio(); router.replace('/onboarding/value'); }} activeOpacity={0.8}>
            <Text style={s.ctaText}>Let's get started</Text>
            <Text style={s.ctaArrow}>→</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingTop: wp(12), paddingBottom: wp(40) },

  // Hero. Fox + startingPoint narrative. No number-shaped score visible.
  heroRow: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  startingPoint: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fp(20),
    fontWeight: typography.weight.semibold,
    fontStyle: 'italic' as const,
    paddingHorizontal: spacing.lg,
  },

  // Welcome card. Sharp's voice. Terracotta border = primary voice moment.
  welcomeCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.accent.border,
    ...shadows.md,
  },
  welcomeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  welcomeLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  welcomeText: { fontSize: typography.size.md, color: colors.text.primary, lineHeight: fp(24), fontWeight: typography.weight.bold },

  listenChip: { backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5), ...shadows.accent },
  listenChipActive: { backgroundColor: colors.accent.dark },
  listenChipText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.inverse, letterSpacing: 0.3 },

  // What I heard. Combined card: narrative + verbatim-quote-with-rewrite.
  // The conversion moment. The user reads their own words quoted at them
  // and sees a sharper version offered. Daily-amber bg = take note.
  heardCard: {
    backgroundColor: colors.daily.bg,
    borderWidth: 1.5,
    borderColor: colors.daily.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heardLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.daily.text, letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: spacing.sm },
  heardText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.semibold, marginBottom: spacing.lg },

  // Snippet box — the verbatim quote + sharper rewrite. Inset white card
  // inside the amber heard card so it reads as the proof point.
  snippetBox: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  snippetRow: { marginBottom: spacing.sm },
  snippetTag: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 4 },
  snippetTagSharp: { color: colors.success },
  snippetOriginal: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' as const },
  snippetRewrite: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontStyle: 'italic' as const, fontWeight: typography.weight.bold },
  snippetDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.sm },
  snippetWhy: { fontSize: fp(10), color: colors.text.tertiary, lineHeight: fp(16), marginTop: spacing.sm, fontStyle: 'italic' as const },

  // Coaching pair — positives + improvements as compact beats.
  positiveCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  improveCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
  coachingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  coachingEmoji: { fontSize: fp(13), color: colors.success, fontWeight: typography.weight.black },
  improveEmoji: { color: colors.accent.primary, fontSize: fp(18), lineHeight: fp(13) },
  coachingLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  coachingText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },

  // Focus card. The one muscle to drill first.
  focusCard: {
    backgroundColor: colors.accent.light,
    borderWidth: 1.5,
    borderColor: colors.accent.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  focusEmoji: { fontSize: fp(16) },
  focusLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  focusText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold },

  // Journey card. Three numbered skills + arc framing at bottom that names
  // Sharp features. The "here's how we'll grow together" moment.
  journeyCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  journeyLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, letterSpacing: 1.2, textTransform: 'uppercase' as const, marginBottom: spacing.xs },
  journeyIntro: { fontSize: typography.size.sm, color: colors.text.tertiary, lineHeight: fp(20), marginBottom: spacing.lg },
  skillRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  skillNum: {
    width: wp(30), height: wp(30), borderRadius: wp(15),
    backgroundColor: colors.accent.light,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.accent.border,
  },
  skillNumText: { fontSize: fp(13), fontWeight: typography.weight.black, color: colors.accent.primary },
  skillBody: { flex: 1 },
  skillTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary, lineHeight: fp(22) },
  skillWhy: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginTop: 3 },
  journeyArc: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  journeyArcText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontWeight: typography.weight.semibold, fontStyle: 'italic' as const },

  // Model answer. The conversion lever. Sage-green.
  modelCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xxl, ...shadows.sm },
  modelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.md },
  modelLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.success, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  modelSubLabel: { fontSize: fp(10), color: colors.text.muted, marginTop: 2 },
  modelListenChip: { backgroundColor: colors.success },
  modelText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic' as const, fontWeight: typography.weight.semibold },

  cta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), ...shadows.accent },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaArrow: { fontSize: typography.size.md, color: colors.text.inverse, opacity: 0.7 },
});
