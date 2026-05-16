// @ts-nocheck
// Feature disabled for MVP; references symbols not yet wired in. See src/constants/features.ts.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { playCoachingAudio, stopAudio } from '../../src/services/tts';
import type { RealtimeIntervention } from '../../src/types';

const DIMS = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

const ISSUE_ICONS: Record<string, string> = {
  buried_point: '🎯', excessive_hedging: '🔀', filler_burst: '💬',
  tangent: '↩️', rambling: '🔄', no_substance: '📊',
};

const ISSUE_LABELS: Record<string, string> = {
  buried_point: 'Buried Point', excessive_hedging: 'Hedging', filler_burst: 'Filler Words',
  tangent: 'Tangent', rambling: 'Rambling', no_substance: 'No Substance',
};

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

export default function RealtimeCoachingResults() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const scores = safeParse(p.scores as string, { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 });
  const overall = parseFloat((p.overall as string) || '0');
  const summary = (p.summary as string) || '';
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const insight = (p.coachingInsight as string) || '';
  const awarenessNote = (p.awarenessNote as string) || '';
  const fillers = safeParse<string[]>(p.fillerWordsFound as string, []);
  const fillerCount = parseInt((p.fillerCount as string) || '0');
  const modelAnswer = (p.modelAnswer as string) || '';
  const communicationTip = (p.communicationTip as string) || '';
  const snippetOriginal = (p.snippetOriginal as string) || '';
  const snippetRewrite = (p.snippetRewrite as string) || '';
  const snippetProblems = safeParse<string[]>(p.snippetProblems as string, []);
  const snippetExplanation = (p.snippetExplanation as string) || '';
  const interventions = safeParse<RealtimeIntervention[]>(p.interventions as string, []);
  const totalDuration = parseInt((p.totalDuration as string) || '90');

  const [textOnly, setTextOnly] = React.useState(false);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (insight) {
      playCoachingAudio(insight).catch(() => false).then(played => {
        if (mountedRef.current && !played) setTextOnly(true);
      });
    }
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  const scoreColor = getScoreColor(overall);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Results</Text>
          <View style={s.rtcBadge}><Text style={s.rtcBadgeText}>LIVE COACHING</Text></View>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} hitSlop={12}>
            <Text style={s.close}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Score */}
        <FadeIn delay={100}>
          <View style={s.scoreSection}>
            <ScoreReveal score={overall} size={wp(100)} color={scoreColor} />
            <Text style={s.scoreLabel}>Overall Score</Text>
          </View>
        </FadeIn>

        {/* 5 Dimensions */}
        <FadeIn delay={300}>
          <View style={s.dimsCard}>
            {DIMS.map(dim => {
              const val = scores[dim] || 0;
              const dimColor = getScoreColor(val);
              return (
                <View key={dim} style={[s.dimRow, dim === 'awareness' && s.dimRowLast]}>
                  <Text style={s.dimLabel}>{DIM_LABELS[dim]}</Text>
                  <View style={s.dimTrack}><View style={[s.dimFill, { width: `${val * 10}%`, backgroundColor: dimColor }]} /></View>
                  <Text style={[s.dimValue, { color: dimColor }]}>{val.toFixed(1)}</Text>
                </View>
              );
            })}
          </View>
        </FadeIn>

        {/* Intervention Timeline */}
        <FadeIn delay={500}>
          <Text style={s.sectionLabel}>Live Coaching Timeline</Text>
          {interventions.length === 0 ? (
            <View style={s.noInterventionCard}>
              <Text style={s.noInterventionEmoji}>✅</Text>
              <Text style={s.noInterventionTitle}>Clean delivery</Text>
              <Text style={s.noInterventionText}>No coaching nudges needed. You stayed structured, specific, and on point.</Text>
            </View>
          ) : (
            <View style={s.timelineCard}>
              {interventions.map((iv, i) => {
                const position = totalDuration > 0 ? (iv.timestamp / totalDuration) * 100 : 0;
                return (
                  <View key={i} style={s.timelineItem}>
                    <View style={s.timelineLeft}>
                      <View style={[s.timelineDot, iv.severity >= 3 ? s.timelineDotCritical : s.timelineDotNotable]} />
                      {i < interventions.length - 1 && <View style={s.timelineLine} />}
                    </View>
                    <View style={s.timelineContent}>
                      <View style={s.timelineHeader}>
                        <Text style={s.timelineIcon}>{ISSUE_ICONS[iv.issue] || '💡'}</Text>
                        <Text style={s.timelineIssue}>{ISSUE_LABELS[iv.issue] || 'Coaching'}</Text>
                        <Text style={s.timelineTime}>{iv.timestamp}s</Text>
                      </View>
                      <Text style={s.timelineMessage}>"{iv.message}"</Text>
                      <Text style={s.timelineReasoning}>{iv.reasoning}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </FadeIn>

        {/* What went well */}
        {positives ? (
          <FadeIn delay={700}>
            <View style={s.positiveCard}>
              <Text style={s.cardEmoji}>✓</Text>
              <Text style={s.positiveText}>{positives}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* To work on */}
        {improvements ? (
          <FadeIn delay={800}>
            <View style={s.improveCard}>
              <Text style={s.cardEmoji}>🎯</Text>
              <Text style={s.improveText}>{improvements}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Coaching insight */}
        {insight ? (
          <FadeIn delay={900}>
            <View style={s.insightCard}>
              <Text style={s.cardEmoji}>💡</Text>
              <Text style={s.insightText}>{insight}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Snippet before/after */}
        {snippetOriginal && snippetRewrite ? (
          <FadeIn delay={1000}>
            <Text style={s.sectionLabel}>Sharpen This</Text>
            <View style={s.snippetCard}>
              <Text style={s.snippetLabel}>What you said</Text>
              <Text style={s.snippetOriginal}>"{snippetOriginal}"</Text>
              {snippetProblems.length > 0 && (
                <View style={s.snippetProblems}>
                  {snippetProblems.map((prob, i) => (
                    <View key={i} style={s.snippetProbRow}>
                      <View style={s.snippetProbDot} />
                      <Text style={s.snippetProbText}>{prob}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={[s.snippetLabel, { marginTop: spacing.md }]}>Sharper version</Text>
              <Text style={s.snippetRewrite}>"{snippetRewrite}"</Text>
              {snippetExplanation ? <Text style={s.snippetExplanation}>{snippetExplanation}</Text> : null}
            </View>
          </FadeIn>
        ) : null}

        {/* Model answer */}
        {modelAnswer ? (
          <FadeIn delay={1100}>
            <Text style={s.sectionLabel}>Model Answer</Text>
            <View style={s.modelCard}>
              <Text style={s.modelText}>"{modelAnswer}"</Text>
              <Text style={s.modelHint}>What a 9/10 sounds like</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Filler words */}
        {fillerCount > 0 && fillers.length > 0 && (
          <FadeIn delay={1200}>
            <Text style={s.sectionLabel}>Filler Words ({fillerCount})</Text>
            <View style={s.fillerRow}>
              {fillers.map((f, i) => (
                <View key={i} style={s.fillerPill}><Text style={s.fillerText}>{f}</Text></View>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Communication tip */}
        {communicationTip ? (
          <FadeIn delay={1300}>
            <View style={s.tipCard}>
              <Text style={s.tipLabel}>COMMUNICATION TIP</Text>
              <Text style={s.tipText}>{communicationTip}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Text style={s.primaryBtnText}>Back to home</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: wp(30) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: layout.screenPadding },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  rtcBadge: { backgroundColor: colors.realtime.bg, borderWidth: 1.5, borderColor: colors.realtime.border, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  rtcBadgeText: { fontSize: fp(8), fontWeight: typography.weight.black, color: colors.realtime.text, letterSpacing: 1 },
  close: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  scoreSection: { alignItems: 'center', marginBottom: spacing.xl },
  scoreLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.text.muted, marginTop: spacing.sm },

  // Dimensions
  dimsCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  dimRowLast: { borderBottomWidth: 0 },
  dimLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.secondary, width: wp(80) },
  dimTrack: { flex: 1, height: wp(6), backgroundColor: colors.bg.tertiary, borderRadius: wp(3), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(3) },
  dimValue: { fontSize: typography.size.sm, fontWeight: typography.weight.black, width: wp(32), textAlign: 'right' },

  // Section label
  sectionLabel: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },

  // No intervention
  noInterventionCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xl },
  noInterventionEmoji: { fontSize: fp(28), marginBottom: spacing.sm },
  noInterventionTitle: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.success, marginBottom: spacing.xs },
  noInterventionText: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center', lineHeight: fp(20) },

  // Timeline
  timelineCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.md },
  timelineItem: { flexDirection: 'row', gap: spacing.md },
  timelineLeft: { alignItems: 'center', width: wp(16) },
  timelineDot: { width: wp(12), height: wp(12), borderRadius: wp(6), marginTop: wp(2) },
  timelineDotNotable: { backgroundColor: '#D4A060' },
  timelineDotCritical: { backgroundColor: colors.error },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: wp(4) },
  timelineContent: { flex: 1, paddingBottom: spacing.lg },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  timelineIcon: { fontSize: fp(12) },
  timelineIssue: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1 },
  timelineTime: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted, marginLeft: 'auto' },
  timelineMessage: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary, lineHeight: fp(18), marginBottom: spacing.xs },
  timelineReasoning: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(16) },

  // Feedback cards
  positiveCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  cardEmoji: { fontSize: fp(16) },
  positiveText: { flex: 1, fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },

  improveCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  improveText: { flex: 1, fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  insightCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.realtime.bg, borderWidth: 1.5, borderColor: colors.realtime.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
  insightText: { flex: 1, fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.bold },

  // Snippet
  snippetCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.md },
  snippetLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  snippetOriginal: { fontSize: typography.size.sm, color: colors.error, fontStyle: 'italic', lineHeight: fp(18), borderLeftWidth: 3, borderLeftColor: colors.error, paddingLeft: spacing.md },
  snippetProblems: { marginTop: spacing.md, marginBottom: spacing.sm },
  snippetProbRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  snippetProbDot: { width: wp(5), height: wp(5), borderRadius: wp(3), backgroundColor: colors.error, marginTop: wp(5) },
  snippetProbText: { flex: 1, fontSize: typography.size.xs, color: colors.text.secondary, lineHeight: fp(16) },
  snippetRewrite: { fontSize: typography.size.sm, color: colors.success, fontWeight: typography.weight.semibold, lineHeight: fp(18), borderLeftWidth: 3, borderLeftColor: colors.success, paddingLeft: spacing.md },
  snippetExplanation: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(16), marginTop: spacing.md },

  // Model answer
  modelCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
  modelText: { fontSize: typography.size.sm, color: colors.text.primary, fontStyle: 'italic', lineHeight: fp(20) },
  modelHint: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: spacing.md },

  // Fillers
  fillerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  fillerPill: { backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(4) },
  fillerText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.error },

  // Tip
  tipCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
  tipLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  tipText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  // Actions
  actions: { marginTop: spacing.md },
  primaryBtn: { backgroundColor: colors.realtime.text, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', ...shadows.accent },
  primaryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: '#FFFFFF' },
});
