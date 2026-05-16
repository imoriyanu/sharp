import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getSessions, getStreak } from '../../src/services/storage';
import { FEATURES } from '../../src/constants/features';
import type { SessionSummary, Streak } from '../../src/types';

// Labels/emoji/bg keep entries for `conversation`. Historical sessions from
// when the feature was tested in dev still need to render correctly. The
// filter chip itself is gated on FEATURES.conversation below.
const TYPE_LABELS: Record<string, string> = { daily_30: 'Daily', one_shot: 'One Shot', threaded: 'Threaded', duel: 'Duel', conversation: 'Conversation' };
const TYPE_EMOJI: Record<string, string> = { daily_30: '☀️', one_shot: '⚡', threaded: '⚓', duel: '⚔️', conversation: '💬' };
const TYPE_BG: Record<string, string> = { daily_30: colors.daily.bg, threaded: colors.feedback.positiveBg, duel: colors.duel.bg, conversation: colors.duel.bg };
const FILTER_OPTIONS = (FEATURES.conversation
  ? ['All', 'Daily', 'One Shot', 'Threaded', 'Voice']
  : ['All', 'Daily', 'One Shot', 'Threaded']
) as readonly string[];
const FILTER_MAP: Record<string, string | null> = { All: null, Daily: 'daily_30', 'One Shot': 'one_shot', Threaded: 'threaded', Voice: 'conversation' };

// Sparkline of overall scores. Renders a smooth-ish line + dot on the latest
// point. Older points fade so the eye lands on momentum, not noise.
function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const W = wp(295);
  const H = wp(56);
  const padX = 6;
  const padY = 6;
  const xStep = (W - padX * 2) / (scores.length - 1);
  const yScale = (H - padY * 2) / 10;
  const pts = scores.map((sc, i) => `${padX + i * xStep},${H - padY - sc * yScale}`).join(' ');
  const last = scores[scores.length - 1];
  const lastX = padX + (scores.length - 1) * xStep;
  const lastY = H - padY - last * yScale;
  return (
    <Svg width={W} height={H}>
      {/* mid reference at score 5 */}
      <Line x1={padX} y1={H - padY - 5 * yScale} x2={W - padX} y2={H - padY - 5 * yScale} stroke={colors.borderLight} strokeWidth={1} strokeDasharray="3,3" />
      <Polyline points={pts} stroke={colors.accent.primary} strokeWidth={2} fill="none" />
      <Circle cx={lastX} cy={lastY} r={4} fill={colors.accent.primary} />
    </Svg>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [filter, setFilter] = useState<string>('All');

  const loadSessions = useCallback(async () => {
    const [data, streakData] = await Promise.all([getSessions(), getStreak()]);
    setSessions(data);
    setStreak(streakData);
  }, []);

  useFocusEffect(useCallback(() => { loadSessions(); }, []));

  const filtered = filter === 'All' ? sessions : sessions.filter(s => s.type === FILTER_MAP[filter]);
  const avgScore = filtered.length > 0 ? (filtered.reduce((sum, s) => sum + s.overall, 0) / filtered.length).toFixed(1) : null;

  // Sparkline: last 14 sessions, oldest-first. Sessions list is newest-first
  // so we reverse the slice. Skip zero scores (e.g. unscored threaded turns
  // that snuck in pre-bugfix) so they don't drag the trend line to the floor.
  const trendScores = filtered
    .slice(0, 14)
    .reverse()
    .map(s => s.overall)
    .filter(sc => sc > 0);

  // Streak chip logic: ≥2 = celebrate, 1 = keep-it-going, 0 with history = soft CTA.
  const currentStreak = streak?.currentStreak || 0;
  let streakChip: { kind: 'fire' | 'soft' | 'cta'; text: string } | null = null;
  if (currentStreak >= 2) streakChip = { kind: 'fire', text: `🔥 ${currentStreak}-day streak` };
  else if (currentStreak === 1) streakChip = { kind: 'soft', text: 'Day 1. Keep it going' };
  else if (sessions.length > 0) streakChip = { kind: 'cta', text: 'Start a streak. Do the Daily' };

  const renderItem = useCallback(({ item: sess }: { item: SessionSummary }) => {
    const date = new Date(sess.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const dateStr = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity style={s.item} onPress={() => router.push(`/session/${sess.id}`)} activeOpacity={0.7}>
        <View style={[s.typeIcon, { backgroundColor: TYPE_BG[sess.type] || colors.accent.light }]}>
          <Text style={s.typeEmoji}>{TYPE_EMOJI[sess.type] || '⚡'}</Text>
        </View>
        <View style={s.itemInfo}>
          <Text style={s.itemType}>{TYPE_LABELS[sess.type] || 'Session'}</Text>
          <Text style={s.question} numberOfLines={1}>{sess.scenario || 'Practice session'}</Text>
          <Text style={s.meta}>{dateStr} · {sess.turnCount} turn{sess.turnCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={s.scoreWrap}>
          <Text style={[s.score, { color: getScoreColor(sess.overall) }]}>{sess.overall.toFixed(1)}</Text>
          <View style={[s.scoreDot, { backgroundColor: getScoreColor(sess.overall) }]} />
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={true}
        initialNumToRender={10}
        ListHeaderComponent={
          <>
            <Text style={s.title}>History</Text>
            {sessions.length > 0 && (
              <View style={s.statsRow}>
                <Text style={s.statText}>{filtered.length} session{filtered.length !== 1 ? 's' : ''}</Text>
                {avgScore && <Text style={s.statText}>Avg: <Text style={[s.statHighlight, { color: getScoreColor(parseFloat(avgScore)) }]}>{avgScore}</Text></Text>}
              </View>
            )}

            {/* Streak chip. Celebrates momentum or nudges back into the daily habit */}
            {streakChip && (
              <TouchableOpacity
                style={[
                  s.streakChip,
                  streakChip.kind === 'fire' && s.streakChipFire,
                  streakChip.kind === 'soft' && s.streakChipSoft,
                  streakChip.kind === 'cta' && s.streakChipCta,
                ]}
                onPress={() => router.push(streakChip.kind === 'cta' ? '/daily/challenge' : '/streak')}
                activeOpacity={0.7}
              >
                <Text style={[
                  s.streakChipText,
                  streakChip.kind === 'fire' && s.streakChipTextFire,
                  streakChip.kind !== 'fire' && s.streakChipTextSoft,
                ]}>{streakChip.text}</Text>
                <Text style={[s.streakChipArrow, streakChip.kind === 'fire' ? s.streakChipTextFire : s.streakChipTextSoft]}>→</Text>
              </TouchableOpacity>
            )}

            {/* Trend sparkline. Last 14 overall scores, tap to open full analytics */}
            {trendScores.length >= 2 && (
              <TouchableOpacity style={s.trendCard} onPress={() => router.push('/analytics')} activeOpacity={0.8}>
                <View style={s.trendHeader}>
                  <Text style={s.trendLabel}>Score trend</Text>
                  <Text style={s.trendRange}>{trendScores.length} sessions</Text>
                </View>
                <Sparkline scores={trendScores} />
                <View style={s.trendFooter}>
                  <Text style={s.trendAxis}>Oldest</Text>
                  <Text style={s.trendAxis}>Latest: <Text style={{ color: getScoreColor(trendScores[trendScores.length - 1]), fontWeight: typography.weight.black }}>{trendScores[trendScores.length - 1].toFixed(1)}</Text></Text>
                </View>
              </TouchableOpacity>
            )}

            {sessions.length > 3 && (
              <View style={s.filterRow}>
                {FILTER_OPTIONS.map(f => (
                  <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => setFilter(f)} activeOpacity={0.7}>
                    <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <FadeIn>
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>{filter !== 'All' ? '🔍' : '📊'}</Text>
              <Text style={s.emptyTitle}>{filter !== 'All' ? `No ${filter} sessions` : 'No sessions yet'}</Text>
              <Text style={s.emptyText}>{filter !== 'All' ? 'Try a different filter or start a new session' : 'Complete a Daily Challenge or One Shot to see your history here'}</Text>
            </View>
          </FadeIn>
        }
        ListFooterComponent={<View style={s.bottomSpacer} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  statsRow: { flexDirection: 'row', gap: spacing.lg, marginTop: wp(3), marginBottom: spacing.md },
  statText: { fontSize: typography.size.sm, color: colors.text.muted },
  statHighlight: { fontWeight: typography.weight.black },

  streakChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.pill, paddingVertical: wp(10), paddingHorizontal: wp(16), marginBottom: spacing.md, ...shadows.sm },
  streakChipFire: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border },
  streakChipSoft: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder },
  streakChipCta: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.borderLight },
  streakChipText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  streakChipTextFire: { color: colors.accent.primary },
  streakChipTextSoft: { color: colors.text.secondary },
  streakChipArrow: { fontSize: fp(14), fontWeight: typography.weight.bold },

  trendCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  trendLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  trendRange: { fontSize: fp(10), color: colors.text.muted },
  trendFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  trendAxis: { fontSize: fp(10), color: colors.text.muted },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  filterChip: { paddingHorizontal: wp(14), paddingVertical: wp(7), borderRadius: radius.pill, backgroundColor: colors.bg.tertiary },
  filterChipActive: { backgroundColor: colors.accent.primary },
  filterText: { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  filterTextActive: { color: '#FFF' },

  empty: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', marginTop: spacing.xxl, ...shadows.md },
  emptyEmoji: { fontSize: fp(28), marginBottom: spacing.md },
  emptyTitle: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.sm },
  emptyText: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(20) },

  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm },
  typeIcon: { width: wp(40), height: wp(40), borderRadius: wp(12), alignItems: 'center', justifyContent: 'center' },
  typeEmoji: { fontSize: fp(16) },
  itemInfo: { flex: 1 },
  itemType: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.tertiary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  question: { fontSize: typography.size.sm, color: colors.text.primary, fontWeight: typography.weight.semibold, marginTop: 2 },
  meta: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2 },
  scoreWrap: { alignItems: 'center' },
  score: { fontSize: fp(20), fontWeight: typography.weight.black, letterSpacing: -0.5 },
  scoreDot: { width: wp(6), height: wp(3), borderRadius: wp(2), marginTop: wp(3) },

  bottomSpacer: { height: wp(50) },
});
