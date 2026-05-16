import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { FadeIn, ScoreReveal, LoadingScreen } from '../../src/components/Animations';
import { getConversationState, clearConversationState, getContext, saveSession, updateSessionScore, generateId } from '../../src/services/storage';
import { apiPost } from '../../src/services/api';
import type { ConversationState, ConversationDebrief } from '../../src/types';

export default function ConversationDebriefScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [state, setState] = useState<ConversationState | null>(null);
  const [debrief, setDebrief] = useState<ConversationDebrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Analysing your conversation...');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadDebrief();
    return () => { mountedRef.current = false; };
  }, []);

  async function loadDebrief() {
    const loaded = await getConversationState();
    if (!loaded) { router.back(); return; }
    setState(loaded);

    try {
      const ctx = await getContext();

      // Include turns where at least the agent spoke. User may have short/empty responses
      const turns = loaded.turns.filter(t => t.agentMessage || t.userTranscript);

      if (turns.length === 0) {
        throw new Error('No conversation recorded. Try speaking for longer next time.');
      }

      // For the API, include all turns. Even ones with only agent messages
      const apiTurns = turns.map(t => ({
        ...t,
        userTranscript: t.userTranscript || '(no response)',
      }));

      setLoadingMsg('Generating coaching analysis...');

      const result = await apiPost<ConversationDebrief>('/conversation/debrief', {
        agentPersona: loaded.agentPersona,
        scenarioDescription: loaded.scenarioDescription,
        scenario: loaded.config.scenario,
        turns: apiTurns,
        internalNotes: [],
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        documentExtractions: ctx?.documents?.map(d => d.structuredExtraction) || [],
      });

      if (mountedRef.current) {
        setDebrief(result);

        // Save session with actual scores to history
        const session = {
          id: loaded.id,
          type: 'conversation' as const,
          scenario: `${loaded.config.scenario}: ${loaded.scenarioDescription}`,
          turns: turns.map((t: any, i: number) => ({
            id: generateId(),
            turnNumber: i + 1,
            question: t.agentMessage,
            questionReasoning: '',
            questionTargets: 'structure' as const,
            questionDifficulty: 5,
            transcript: t.userTranscript,
            scores: result.scores ? {
              structure: result.scores.clarity || 0,
              concision: result.scores.adaptability || 0,
              substance: result.scores.substance || 0,
              fillerWords: result.scores.composure || 0,
              awareness: result.scores.persuasiveness || 0,
            } : { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 },
            overall: result.overall || 0,
            summary: result.summary || '',
            coachingInsight: result.coachingInsight || '',
            awarenessNote: null,
            snippet: { original: '', problems: [], rewrite: '', explanation: '' },
          })),
          createdAt: loaded.startedAt,
        };
        await saveSession(session);
        // Also update the summary score directly
        await updateSessionScore(loaded.id, result.overall || 0);

        await clearConversationState();
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message || 'Failed to generate debrief.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message={loadingMsg} submessage={`Reviewing ${state?.turns.filter(t => t.userTranscript).length || 0} turns`} />
      </SafeAreaView>
    );
  }

  if (error || !debrief) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadingWrap}>
          <Text style={s.errorTitle}>Something went wrong</Text>
          <Text style={s.errorMsg}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); setError(''); loadDebrief(); }} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} activeOpacity={0.7} style={s.ghostLink}>
            <Text style={s.ghostLinkText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const scores = debrief.scores;
  const dims = [
    { label: 'Clarity', value: scores.clarity, icon: '🎯' },
    { label: 'Persuasion', value: scores.persuasiveness, icon: '💡' },
    { label: 'Composure', value: scores.composure, icon: '🧊' },
    { label: 'Substance', value: scores.substance, icon: '📊' },
    { label: 'Adaptability', value: scores.adaptability, icon: '🔄' },
  ];

  const trajectoryConfig = {
    improving: { text: 'Improving', color: colors.success, arrow: '↑' },
    declining: { text: 'Declining', color: colors.error, arrow: '↓' },
    steady: { text: 'Steady', color: colors.text.tertiary, arrow: '→' },
  };
  const traj = trajectoryConfig[debrief.trajectory as keyof typeof trajectoryConfig] || trajectoryConfig.steady;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeIn>
          <Text style={s.label}>CONVERSATION DEBRIEF</Text>
          <Text style={s.personaText}>{state?.agentPersona}</Text>
          <Text style={s.scenarioText}>{state?.scenarioDescription}</Text>
        </FadeIn>

        {/* Overall Score. Big and prominent */}
        <FadeIn delay={100}>
          <View style={s.overallCard}>
            <ScoreReveal score={debrief.overall} color={getScoreColor(debrief.overall)} size={fp(56)} />
            <Text style={s.overallLabel}>Overall Score</Text>
            <View style={[s.trajectoryBadge, { backgroundColor: `${traj.color}15` }]}>
              <Text style={[s.trajectoryText, { color: traj.color }]}>{traj.arrow} {traj.text} through the conversation</Text>
            </View>
          </View>
        </FadeIn>

        {/* Dimension Scores. Horizontal cards */}
        <FadeIn delay={200}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dimRow}>
            {dims.map(d => (
              <View key={d.label} style={s.dimCard}>
                <Text style={s.dimIcon}>{d.icon}</Text>
                <Text style={[s.dimScore, { color: getScoreColor(d.value) }]}>{d.value}</Text>
                <Text style={s.dimLabel}>{d.label}</Text>
              </View>
            ))}
          </ScrollView>
        </FadeIn>

        {/* Summary */}
        <FadeIn delay={300}>
          <View style={s.card}>
            <Text style={s.cardTitle}>How it went</Text>
            <Text style={s.cardBody}>{debrief.summary}</Text>
          </View>
        </FadeIn>

        {/* Turn by Turn */}
        {debrief.turnByTurn?.length > 0 && (
          <FadeIn delay={350}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Turn by Turn</Text>
              {debrief.turnByTurn.map(t => (
                <View key={t.turn} style={s.turnRow}>
                  <View style={[s.turnScoreCircle, { borderColor: getScoreColor(t.score) }]}>
                    <Text style={[s.turnScoreText, { color: getScoreColor(t.score) }]}>{t.score}</Text>
                  </View>
                  <View style={s.turnInfo}>
                    <Text style={s.turnLabel}>Turn {t.turn}</Text>
                    <Text style={s.turnNote}>{t.note}</Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Strongest Moment */}
        <FadeIn delay={450}>
          <View style={[s.card, s.positiveCard]}>
            <View style={s.momentHeader}>
              <Text style={[s.momentIcon, { color: colors.success }]}>{'✦'}</Text>
              <Text style={s.cardTitle}>Best Moment</Text>
              <Text style={s.momentTurn}>Turn {debrief.strongestMoment?.turn}</Text>
            </View>
            <Text style={s.quoteText}>"{debrief.strongestMoment?.quote}"</Text>
            <Text style={s.whyText}>{debrief.strongestMoment?.why}</Text>
          </View>
        </FadeIn>

        {/* Weakest Moment */}
        <FadeIn delay={550}>
          <View style={[s.card, s.negativeCard]}>
            <View style={s.momentHeader}>
              <Text style={[s.momentIcon, { color: colors.error }]}>{'⚑'}</Text>
              <Text style={s.cardTitle}>Needs Work</Text>
              <Text style={s.momentTurn}>Turn {debrief.weakestMoment?.turn}</Text>
            </View>
            <Text style={s.quoteText}>"{debrief.weakestMoment?.quote}"</Text>
            <Text style={s.cardSubtitle}>Say this instead:</Text>
            <Text style={s.fixText}>{debrief.weakestMoment?.fix}</Text>
          </View>
        </FadeIn>

        {/* Model Exchange */}
        {debrief.modelExchange && (
          <FadeIn delay={650}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Model Response</Text>
              <Text style={s.cardSub}>How to handle your weakest turn:</Text>
              <View style={s.modelBox}>
                <Text style={s.modelText}>{debrief.modelExchange}</Text>
              </View>
            </View>
          </FadeIn>
        )}

        {/* Coaching Insight */}
        <FadeIn delay={750}>
          <View style={s.insightCard}>
            <Text style={s.insightLabel}>KEY INSIGHT</Text>
            <Text style={s.insightText}>{debrief.coachingInsight}</Text>
          </View>
        </FadeIn>

        {/* Actions */}
        <FadeIn delay={850}>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace('/conversation/setup')} activeOpacity={0.8}>
            <Text style={s.primaryBtnText}>Practice Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.7}>
            <Text style={s.ghostBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scrollContent: { padding: layout.screenPadding, paddingBottom: wp(40) },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  loadingOrb: {
    width: wp(80),
    height: wp(80),
    borderRadius: wp(40),
    backgroundColor: colors.accent.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },

  errorTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text.primary },
  errorMsg: { fontSize: typography.size.sm, color: colors.error, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(14), paddingHorizontal: wp(32), marginTop: spacing.md },
  retryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostLink: { paddingTop: spacing.md },
  ghostLinkText: { fontSize: typography.size.sm, color: colors.text.muted },

  label: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted, letterSpacing: 1.5, marginBottom: spacing.xs },
  personaText: { fontSize: fp(22), fontWeight: typography.weight.black, color: colors.text.primary },
  scenarioText: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.xs, lineHeight: fp(20), marginBottom: spacing.xl },

  // Overall
  overallCard: {
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    paddingVertical: wp(28),
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  overallScore: { fontSize: fp(56), fontWeight: typography.weight.black },
  overallLabel: { fontSize: typography.size.sm, color: colors.text.tertiary, fontWeight: typography.weight.semibold, marginTop: 2 },
  trajectoryBadge: {
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  trajectoryText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold },

  // Dimensions. Horizontal scroll
  dimRow: { gap: spacing.sm, paddingBottom: spacing.lg },
  dimCard: {
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    paddingVertical: wp(14),
    paddingHorizontal: wp(16),
    minWidth: wp(80),
    ...shadows.sm,
  },
  dimIcon: { fontSize: fp(18), marginBottom: spacing.xs },
  dimScore: { fontSize: fp(22), fontWeight: typography.weight.black },
  dimLabel: { fontSize: fp(9), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginTop: 2 },

  // Cards
  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: wp(18),
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  positiveCard: { borderLeftWidth: 3, borderLeftColor: colors.success },
  negativeCard: { borderLeftWidth: 3, borderLeftColor: colors.error },
  cardTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.sm },
  cardSub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginBottom: spacing.xs },
  cardSubtitle: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginTop: spacing.md, marginBottom: 4 },
  cardBody: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  // Moment headers
  momentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs },
  momentIcon: { fontSize: fp(14) },
  momentTurn: { fontSize: typography.size.xs, color: colors.text.muted, marginLeft: 'auto', fontWeight: typography.weight.semibold },

  // Turn by turn
  turnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  turnScoreCircle: {
    width: wp(36),
    height: wp(36),
    borderRadius: wp(18),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.primary,
  },
  turnScoreText: { fontSize: fp(13), fontWeight: typography.weight.black },
  turnInfo: { flex: 1 },
  turnLabel: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted },
  turnNote: { fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(16), marginTop: 2 },

  // Quotes
  quoteText: { fontSize: typography.size.sm, color: colors.text.primary, fontStyle: 'italic', lineHeight: fp(20) },
  whyText: { fontSize: typography.size.xs, color: colors.text.secondary, marginTop: spacing.sm, lineHeight: fp(16) },
  fixText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },

  // Model
  modelBox: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  modelText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), fontStyle: 'italic' },

  // Insight
  insightCard: {
    backgroundColor: colors.accent.light,
    borderRadius: radius.lg,
    padding: wp(18),
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent.border,
  },
  insightLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.dark, letterSpacing: 1.5, marginBottom: spacing.sm },
  insightText: { fontSize: typography.size.base, color: colors.accent.dark, lineHeight: fp(22), fontWeight: typography.weight.semibold },

  // Buttons
  primaryBtn: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(16),
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.accent,
  },
  primaryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { alignItems: 'center', paddingVertical: spacing.lg },
  ghostBtnText: { fontSize: typography.size.sm, color: colors.text.muted, fontWeight: typography.weight.semibold },
});
