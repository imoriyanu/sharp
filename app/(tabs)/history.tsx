import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getSessions } from '../../src/services/storage';
import type { SessionSummary } from '../../src/types';

const TYPE_LABELS: Record<string, string> = { daily_30: 'Daily', one_shot: 'One Shot', threaded: 'Threaded', duel: 'Duel' };
const TYPE_EMOJI: Record<string, string> = { daily_30: '☀️', one_shot: '⚡', threaded: '⚓', duel: '⚔️' };

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadSessions = useCallback(async () => {
    const data = await getSessions();
    setSessions(data);
  }, []);

  useFocusEffect(useCallback(() => { loadSessions(); }, []));

  async function onRefresh() {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  }

  const renderItem = useCallback(({ item: sess }: { item: SessionSummary }) => (
    <TouchableOpacity style={s.item} onPress={() => router.push(`/session/${sess.id}`)} activeOpacity={0.7}>
      <View style={[s.typeIcon, { backgroundColor: sess.type === 'daily_30' ? colors.daily.bg : sess.type === 'threaded' ? colors.feedback.positiveBg : colors.accent.light }]}>
        <Text style={s.typeEmoji}>{TYPE_EMOJI[sess.type] || '⚡'}</Text>
      </View>
      <View style={s.itemInfo}>
        <Text style={s.itemType}>{TYPE_LABELS[sess.type] || 'Session'}</Text>
        <Text style={s.question} numberOfLines={1}>{sess.scenario || 'Practice session'}</Text>
        <Text style={s.meta}>{new Date(sess.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {sess.turnCount} turn{sess.turnCount !== 1 ? 's' : ''}</Text>
      </View>
      <View style={s.scoreWrap}>
        <Text style={[s.score, { color: getScoreColor(sess.overall) }]}>{sess.overall.toFixed(1)}</Text>
        <View style={[s.scoreDot, { backgroundColor: getScoreColor(sess.overall) }]} />
      </View>
    </TouchableOpacity>
  ), []);

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent.primary} />}
        ListHeaderComponent={
          <>
            <Text style={s.title}>History</Text>
            {sessions.length > 0 && (
              <Text style={s.subtitle}>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <FadeIn>
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>📊</Text>
              <Text style={s.emptyTitle}>No sessions yet</Text>
              <Text style={s.emptyText}>Complete a Daily Challenge or One Shot to see your history here</Text>
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
  scroll: { flex: 1 },
  content: { padding: layout.screenPadding },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  subtitle: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: wp(3), marginBottom: spacing.xl },

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
