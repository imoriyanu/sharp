import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getSessions } from '../../src/services/storage';
import type { SessionSummary } from '../../src/types';

const TYPE_LABELS: Record<string, string> = { daily_30: 'Daily', one_shot: 'One Shot', threaded: 'Threaded', duel: 'Duel', conversation: 'Conversation' };
const TYPE_EMOJI: Record<string, string> = { daily_30: '☀️', one_shot: '⚡', threaded: '⚓', duel: '⚔️', conversation: '💬' };
const TYPE_BG: Record<string, string> = { daily_30: colors.daily.bg, threaded: colors.feedback.positiveBg, duel: colors.duel.bg, conversation: colors.duel.bg };
const FILTER_OPTIONS = ['All', 'Daily', 'One Shot', 'Threaded'] as const;
const FILTER_MAP: Record<string, string | null> = { All: null, Daily: 'daily_30', 'One Shot': 'one_shot', Threaded: 'threaded' };

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [filter, setFilter] = useState<string>('All');

  const loadSessions = useCallback(async () => {
    const data = await getSessions();
    setSessions(data);
  }, []);

  useFocusEffect(useCallback(() => { loadSessions(); }, []));

  const filtered = filter === 'All' ? sessions : sessions.filter(s => s.type === FILTER_MAP[filter]);
  const avgScore = filtered.length > 0 ? (filtered.reduce((sum, s) => sum + s.overall, 0) / filtered.length).toFixed(1) : null;

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
