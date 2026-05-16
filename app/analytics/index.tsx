import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { LoadingScreen, FadeIn, AudioWaveBars } from '../../src/components/Animations';
import { playCoachingAudio, stopAudio } from '../../src/services/tts';
import { getProgressData, getContext, getSessions, getRecentSessionSummariesForAnalysis, type ProgressData } from '../../src/services/storage';
import { generateProgressSummary, extractPatterns } from '../../src/services/scoring';
import { isPremium } from '../../src/services/premium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrossSessionPattern } from '../../src/types';

const SUMMARY_CACHE_KEY = 'sharp:summary_cache';
const PATTERN_CACHE_KEY = 'sharp:patterns_cache';
const PATTERN_CACHE_DAYS = 7;
// Lowered from 5 → 3 so trial users (3-session demos) see patterns inside the
// trial window. The backend prompt hedges confidence based on session count
// so 3-session insights read as "directional" not "definitive".
const PATTERN_MIN_SESSIONS = 3;
const PATTERN_INVALIDATE_AT_NEW_SESSIONS = 5;
// Below this many sessions, render the trend chart with a "directional" hedge
// chip. Trends across <5 data points overfit to noise.
const TREND_CONFIDENCE_MIN = 5;

const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

// Dimension info modal copy. Mirrors app/one-shot/results.tsx DIM_INFO so the
// user sees identical descriptions on per-session results and on the cross-
// session Progress screen.
const DIM_INFO: Record<string, { what: string; scale: string }> = {
  structure: {
    what: 'How clearly your answer was organised. Did you lead with the point, signpost the flow, and land it cleanly?',
    scale: '5 = jumbled or buried lead. 7 = clear shape, can be tighter. 9 = hook first, signposted, lands hard.',
  },
  concision: {
    what: 'Whether you said it in the right number of words. Tight beats long. Every line should carry weight.',
    scale: '5 = padded or hedged. 7 = mostly tight, a few extra phrases. 9 = nothing wasted.',
  },
  substance: {
    what: 'How real and specific you were. Numbers, named projects, concrete moves. Not abstractions or platitudes.',
    scale: '5 = generalities. 7 = some specifics, some vagueness. 9 = specific enough to verify.',
  },
  fillerWords: {
    what: 'How clean your speech was. "Um", "like", "you know", "kind of". Higher score = fewer fillers.',
    scale: '5 = noticeable fillers throughout. 7 = a handful. 10 = zero fillers detected.',
  },
  awareness: {
    what: 'How well you read the room. Industry, company, role context. Did your answer feel situationally sharp?',
    scale: '5 = generic answer that could fit anywhere. 7 = appropriate fit. 9 = sharp references that show insight.',
  },
};

export default function AnalyticsScreen() {
  const router = useRouter();

  // Gate: redirect free users to paywall
  useEffect(() => {
    if (!isPremium()) { router.replace('/premium'); }
  }, []);

  const [data, setData] = useState<ProgressData | null>(null);
  const [summary, setSummary] = useState<{ spokenSummary: string; highlights: string[]; focusArea: string; encouragement: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [patterns, setPatterns] = useState<CrossSessionPattern[]>([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  // Dimension info modal. Taps on the ⓘ next to a dimension open this.
  const [openDim, setOpenDim] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    abortRef.current = new AbortController();
    loadData();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      stopAudio();
    };
  }, []);

  async function loadData() {
    const progress = await getProgressData();
    if (!mountedRef.current) return;
    setData(progress);

    if (progress.totalSessions >= 2) {
      try {
        // Check cache. Skip the HTTP request if session count hasn't changed
        const cached = await AsyncStorage.getItem(SUMMARY_CACHE_KEY);
        let result: { spokenSummary: string; highlights: string[]; focusArea: string; encouragement: string };

        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.sessionCount === progress.totalSessions) {
            result = parsed.summary;
          } else {
            result = await fetchAndCacheSummary(progress);
          }
        } else {
          result = await fetchAndCacheSummary(progress);
        }

        if (!mountedRef.current) return;
        setSummary(result);
        setLoading(false);
        setSpeaking(true);
        await playCoachingAudio(result.spokenSummary, abortRef.current?.signal);
        if (mountedRef.current) setSpeaking(false);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        __DEV__ && console.error('Summary error:', e);
        if (mountedRef.current) setLoading(false);
      }
    } else {
      setLoading(false);
    }

    // Patterns load separately. Non-blocking. The summary is the hero, the
    // patterns are the deeper insight; user shouldn't wait on them.
    loadPatterns(progress.totalSessions).catch(() => {});
  }

  async function loadPatterns(totalSessions: number) {
    if (totalSessions < PATTERN_MIN_SESSIONS) return; // backend also gates this. Match the threshold

    // Cache hit: 7 days fresh AND session count hasn't drifted by >= 5
    try {
      const cachedRaw = await AsyncStorage.getItem(PATTERN_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const ageMs = Date.now() - new Date(cached.extractedAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const drift = totalSessions - (cached.sessionCount || 0);
        if (ageDays < PATTERN_CACHE_DAYS && drift < PATTERN_INVALIDATE_AT_NEW_SESSIONS) {
          if (mountedRef.current) setPatterns(cached.patterns || []);
          return;
        }
      }
    } catch (_) { /* cache miss → fetch fresh */ }

    if (mountedRef.current) setPatternsLoading(true);
    try {
      const [sessions, ctx] = await Promise.all([
        getRecentSessionSummariesForAnalysis(15),
        getContext(),
      ]);
      const report = await extractPatterns({
        sessions,
        roleText: ctx?.roleText || '',
        currentCompany: ctx?.currentCompany || '',
        situationText: ctx?.situationText || '',
        dreamRoleAndCompany: ctx?.dreamRoleAndCompany || '',
        notes: ctx?.notes || '',
      }, abortRef.current?.signal);
      if (!mountedRef.current) return;
      const got = report.patterns || [];
      setPatterns(got);
      await AsyncStorage.setItem(PATTERN_CACHE_KEY, JSON.stringify({
        patterns: got,
        sessionCount: totalSessions,
        extractedAt: new Date().toISOString(),
      }));
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      __DEV__ && console.warn('Pattern extraction failed:', e?.message || e);
    } finally {
      if (mountedRef.current) setPatternsLoading(false);
    }
  }

  async function fetchAndCacheSummary(progress: ProgressData) {
    const ctx = await getContext();
    if (!mountedRef.current) throw new DOMException('Unmounted', 'AbortError');
    const result = await generateProgressSummary({
      progressData: progress,
      roleText: ctx?.roleText || '',
      currentCompany: ctx?.currentCompany || '',
    }, abortRef.current?.signal);
    // Cache with session count so it invalidates on next session
    await AsyncStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ sessionCount: progress.totalSessions, summary: result }));
    return result;
  }

  async function playSummary() {
    if (!summary) return;
    if (speaking) { stopAudio(); setSpeaking(false); return; }
    setSpeaking(true);
    await playCoachingAudio(summary.spokenSummary);
    if (mountedRef.current) setSpeaking(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingScreen message="Analysing your progress..." submessage="Reviewing all your sessions" />
      </SafeAreaView>
    );
  }

  if (!data || data.totalSessions < 2) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.emptyContainer}>
          <Text style={s.emptyEmoji}>📊</Text>
          <Text style={s.emptyTitle}>Not enough data yet</Text>
          <Text style={s.emptyDesc}>Complete at least 2 sessions to see your progress analytics and hear your Sharp Summary.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={s.emptyBtnText}>Start practising</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const maxScore = Math.max(...data.overallTrend.map(t => t.score), 1);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Progress</Text>
          <TouchableOpacity onPress={() => { stopAudio(); router.back(); }}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {/* Sharp Summary. The star feature */}
        {summary && (
          <FadeIn>
            <TouchableOpacity style={s.summaryCard} onPress={playSummary} activeOpacity={0.7}>
              <View style={s.summaryHeader}>
                <View style={s.summaryBadge}><Text style={s.summaryBadgeText}>Sharp Summary</Text></View>
                <Text style={s.summaryPlay}>{speaking ? '⏸ Pause' : '🔊 Listen'}</Text>
              </View>
              {speaking && (
                <View style={s.summaryWave}>
                  <AudioWaveBars active={true} color={colors.accent.primary} height={wp(28)} barCount={18} />
                </View>
              )}
              <Text style={s.summaryText}>{summary.spokenSummary}</Text>
              <Text style={s.summaryEncourage}>{summary.encouragement}</Text>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* Key stats */}
        <FadeIn delay={100}>
          <View style={s.statsGrid}>
            <View style={s.statCard}>
              <Text style={s.statNum}>{data.totalSessions}</Text>
              <Text style={s.statLabel}>Sessions</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{data.currentStreak}</Text>
              <Text style={s.statLabel}>Streak</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: getScoreColor(data.bestSession?.score || 0) }]}>{data.bestSession?.score?.toFixed(1) || ', '}</Text>
              <Text style={s.statLabel}>Best</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{data.sessionsThisWeek}</Text>
              <Text style={s.statLabel}>This week</Text>
            </View>
          </View>
        </FadeIn>

        {/* Cross-session patterns. Meta-insights no single session can give.
            Renders above the per-session chart so it lands first on scroll. */}
        {patterns.length > 0 && (
          <>
            <Text style={s.section}>Patterns across your sessions</Text>
            <FadeIn delay={150}>
              {patterns.map((p, i) => (
                <View key={i} style={s.patternCard}>
                  <Text style={s.patternHeadline}>{p.pattern}</Text>
                  {p.impact ? <Text style={s.patternImpact}>{p.impact}</Text> : null}
                  {p.evidence && p.evidence.length > 0 && (
                    <View style={s.patternEvidence}>
                      <Text style={s.patternEvidenceLabel}>Where it shows up</Text>
                      {p.evidence.slice(0, 3).map((q, j) => (
                        <Text key={j} style={s.patternEvidenceQuote}>"{q}"</Text>
                      ))}
                    </View>
                  )}
                  {p.oneThing ? (
                    <View style={s.patternFix}>
                      <Text style={s.patternFixLabel}>One thing to try</Text>
                      <Text style={s.patternFixText}>{p.oneThing}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </FadeIn>
          </>
        )}
        {patternsLoading && patterns.length === 0 && data.totalSessions >= PATTERN_MIN_SESSIONS && (
          <View style={s.patternLoading}>
            <Text style={s.patternLoadingText}>Looking for patterns across your sessions…</Text>
          </View>
        )}

        {/* Score trend chart */}
        {data.overallTrend.length > 1 && (
          <>
            <Text style={s.section}>Score Trend</Text>
            <FadeIn delay={200}>
              <View style={s.chartCard}>
                {/* Sample-size caveat. Trends across <5 data points overfit
                    to noise. Frame as directional so engineers don't read
                    too much into a 3-bar chart. Hides at 5+ sessions. */}
                {data.totalSessions < TREND_CONFIDENCE_MIN && (
                  <View style={s.directionalChip}>
                    <Text style={s.directionalText}>
                      Directional · {data.totalSessions} sessions so far. Trend stabilises after 5+.
                    </Text>
                  </View>
                )}
                <View style={s.chart}>
                  {data.overallTrend.slice(-15).map((point, i, arr) => (
                    <View key={i} style={s.chartBar}>
                      <View style={[s.chartFill, {
                        height: `${Math.min((point.score / 10) * 100, 100)}%`,
                        backgroundColor: getScoreColor(point.score),
                      }]} />
                      {i === arr.length - 1 && (
                        <Text style={s.chartLabel}>{point.score.toFixed(1)}</Text>
                      )}
                    </View>
                  ))}
                </View>
                <View style={s.chartXAxis}>
                  <Text style={s.chartXLabel}>Oldest</Text>
                  <Text style={s.chartXLabel}>Most recent →</Text>
                </View>
              </View>
            </FadeIn>
          </>
        )}

        {/* Dimension breakdown. Labelled clearly that these come from One
            Shot sessions only. Threaded uses a different rubric (Clarity /
            Pressure / Concision / Substance / Consistency) and scores at the
            thread level, so its per-turn dimensions aren't aggregated here. */}
        <View style={s.dimHeader}>
          <Text style={s.section}>One Shot dimensions</Text>
          <Text style={s.dimSubtitle}>Tracked on scored One Shot &amp; Daily sessions. Threaded scores live on the thread debrief.</Text>
        </View>
        <FadeIn delay={300}>
          <View style={s.dimCard}>
            {data.dimensionTrends.map((dim) => (
              <TouchableOpacity key={dim.dimension} style={s.dimRow} onPress={() => setOpenDim(dim.dimension)} activeOpacity={0.6}>
                <Text style={s.dimName}>{DIM_LABELS[dim.dimension] || dim.dimension}</Text>
                <View style={s.dimBarTrack}>
                  <View style={[s.dimBarFill, { width: `${(dim.last5Avg / 10) * 100}%`, backgroundColor: getScoreColor(dim.last5Avg) }]} />
                </View>
                <Text style={[s.dimVal, { color: getScoreColor(dim.last5Avg) }]}>{dim.last5Avg.toFixed(1)}</Text>
                {dim.change !== 0 && data.totalSessions >= 5 ? (
                  <Text style={[s.dimChange, dim.change > 0 ? s.dimUp : s.dimDown]}>
                    {dim.change > 0 ? '↑' : '↓'}{Math.abs(dim.change).toFixed(1)}
                  </Text>
                ) : (
                  <Text style={s.dimHelp}>ⓘ</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </FadeIn>

        {/* Dimension info modal. Same DIM_INFO copy as the One Shot results
            screen so users read identical descriptions everywhere. */}
        <Modal visible={!!openDim} animationType="fade" transparent onRequestClose={() => setOpenDim(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setOpenDim(null)}>
            <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
              {openDim && DIM_INFO[openDim] && (
                <>
                  <Text style={s.modalTitle}>{DIM_LABELS[openDim]}</Text>
                  <Text style={s.modalSection}>What it measures</Text>
                  <Text style={s.modalText}>{DIM_INFO[openDim].what}</Text>
                  <Text style={s.modalSection}>How to read it</Text>
                  <Text style={s.modalText}>{DIM_INFO[openDim].scale}</Text>
                  <TouchableOpacity style={s.modalClose} onPress={() => setOpenDim(null)} activeOpacity={0.8}>
                    <Text style={s.modalCloseText}>Got it</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Focus area */}
        {summary?.focusArea && (
          <FadeIn delay={400}>
            <View style={s.focusCard}>
              <Text style={s.focusLabel}>Focus area</Text>
              <Text style={s.focusText}>{summary.focusArea}</Text>
            </View>
          </FadeIn>
        )}

        {/* Highlights */}
        {summary?.highlights && summary.highlights.length > 0 && (
          <>
            <Text style={s.section}>Highlights</Text>
            <FadeIn delay={500}>
              <View style={s.highlightCard}>
                {summary.highlights.map((h, i) => (
                  <View key={i} style={s.highlightRow}>
                    <Text style={s.highlightDot}>•</Text>
                    <Text style={s.highlightText}>{h}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* Filler trend */}
        {data.fillerTrend.early > 0 && data.totalSessions >= 5 && (
          <FadeIn delay={600}>
            <View style={s.fillerCard}>
              <Text style={s.fillerTitle}>Filler Words</Text>
              <View style={s.fillerRow}>
                <View style={s.fillerStat}>
                  <Text style={s.fillerNum}>{data.fillerTrend.early.toFixed(1)}</Text>
                  <Text style={s.fillerLabel}>Early</Text>
                </View>
                <Text style={s.fillerArrow}>→</Text>
                <View style={s.fillerStat}>
                  <Text style={[s.fillerNum, { color: data.fillerTrend.recent >= data.fillerTrend.early ? colors.success : colors.text.primary }]}>{data.fillerTrend.recent.toFixed(1)}</Text>
                  <Text style={s.fillerLabel}>Recent</Text>
                </View>
              </View>
              <Text style={s.fillerHint}>{data.fillerTrend.recent > data.fillerTrend.early ? 'Improving. Fewer filler words' : data.fillerTrend.recent === data.fillerTrend.early ? 'Holding steady' : 'Room for improvement'}</Text>
            </View>
          </FadeIn>
        )}

        {/* Recent insights */}
        {data.recentInsights.length > 0 && (
          <>
            <Text style={s.section}>Recent Coaching</Text>
            <FadeIn delay={700}>
              {data.recentInsights.map((insight, i) => (
                <View key={i} style={s.insightCard}>
                  <Text style={s.insightText}>💡 {insight}</Text>
                </View>
              ))}
            </FadeIn>
          </>
        )}

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  emptyEmoji: { fontSize: fp(36), marginBottom: spacing.lg },
  emptyTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  emptyDesc: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(20), marginBottom: spacing.xxl },
  emptyBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), paddingHorizontal: spacing.xxl, ...shadows.accent },
  emptyBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Summary card
  summaryCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, ...shadows.lg },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  summaryBadge: { backgroundColor: colors.accent.light, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(4) },
  summaryBadgeText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  summaryPlay: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  summaryWave: { marginBottom: spacing.md },
  summaryText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(24), fontWeight: typography.weight.semibold },
  summaryEncourage: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.bold, marginTop: spacing.md },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', ...shadows.sm },
  statNum: { fontSize: fp(22), fontWeight: typography.weight.black, color: colors.text.primary },
  statLabel: { fontSize: fp(9), fontWeight: typography.weight.semibold, color: colors.text.muted, marginTop: wp(2) },

  // Section
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md, marginTop: spacing.lg },

  // Patterns. The meta-insight section. Higher visual weight than summary
  // (terracotta left rule + cream card) so it reads as the key finding.
  patternCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.accent.primary, ...shadows.md },
  patternHeadline: { fontSize: typography.size.md, color: colors.text.primary, fontWeight: typography.weight.bold, lineHeight: fp(24) },
  patternImpact: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.sm, lineHeight: fp(20) },
  patternEvidence: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  patternEvidenceLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  patternEvidenceQuote: { fontSize: typography.size.sm, color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(20), marginBottom: wp(4) },
  patternFix: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.feedback.positiveBg, borderRadius: radius.md },
  patternFixLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.success, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: wp(4) },
  patternFixText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },
  patternLoading: { padding: spacing.lg, alignItems: 'center' },
  patternLoadingText: { fontSize: typography.size.xs, color: colors.text.muted, fontStyle: 'italic' as const },

  // Chart
  chartCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: wp(120), gap: wp(4) },
  chartBar: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  chartFill: { width: '100%', borderRadius: wp(3), minHeight: wp(4) },
  chartLabel: { fontSize: fp(8), fontWeight: typography.weight.bold, color: colors.text.primary, marginTop: wp(3) },
  chartXAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  chartXLabel: { fontSize: fp(8), color: colors.text.muted },

  // Dimensions
  dimHeader: { marginTop: spacing.lg },
  dimSubtitle: { fontSize: fp(10), color: colors.text.muted, lineHeight: fp(14), marginBottom: spacing.md, marginTop: -spacing.sm },
  dimCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(8) },
  dimName: { fontSize: fp(11), color: colors.text.secondary, width: wp(75), fontWeight: typography.weight.semibold },
  dimBarTrack: { flex: 1, height: wp(7), backgroundColor: colors.borderLight, borderRadius: wp(4), marginHorizontal: wp(8), overflow: 'hidden' },
  dimBarFill: { height: '100%', borderRadius: wp(4) },
  dimVal: { fontSize: fp(13), fontWeight: typography.weight.black, width: wp(28), textAlign: 'right' },
  dimChange: { fontSize: fp(9), fontWeight: typography.weight.bold, width: wp(30), textAlign: 'right' },
  dimUp: { color: colors.success },
  dimDown: { color: colors.error },
  dimHelp: { fontSize: fp(11), color: colors.text.muted, width: wp(30), textAlign: 'right' },

  // Sample-size caveat chip
  directionalChip: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5), alignSelf: 'flex-start', marginBottom: spacing.md },
  directionalText: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },

  // Dimension info modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(58,42,26,0.4)', alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  modalCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: wp(380), ...shadows.lg },
  modalTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.lg },
  modalSection: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.sm },
  modalText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20) },
  modalClose: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginTop: spacing.xl, ...shadows.accent },
  modalCloseText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Focus area
  focusCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  focusLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  focusText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.bold },

  // Highlights
  highlightCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm },
  highlightRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  highlightDot: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.bold },
  highlightText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), flex: 1 },

  // Filler trend
  fillerCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, ...shadows.sm },
  fillerTitle: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.md },
  fillerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  fillerStat: { alignItems: 'center' },
  fillerNum: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.primary },
  fillerLabel: { fontSize: fp(9), color: colors.text.muted, marginTop: wp(2) },
  fillerArrow: { fontSize: fp(18), color: colors.text.muted },
  fillerHint: { fontSize: typography.size.xs, color: colors.text.tertiary, textAlign: 'center', marginTop: spacing.md },

  // Recent insights
  insightCard: { backgroundColor: colors.daily.bg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  insightText: { fontSize: typography.size.xs, color: colors.text.primary, lineHeight: fp(18), fontWeight: typography.weight.semibold },

  bottomSpacer: { height: wp(50) },
});
