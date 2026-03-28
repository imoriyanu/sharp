import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getStreakData, getStreak } from '../../src/services/storage';
import { STREAK_BADGES, getNextBadge, getCurrentBadge } from '../../src/constants/badges';
import type { StreakData, Streak } from '../../src/types';

export default function StreakScreen() {
  const router = useRouter();
  const [data, setData] = useState<StreakData | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);

  useEffect(() => {
    Promise.all([getStreakData(), getStreak()]).then(([d, s]) => { setData(d); setStreak(s); });
  }, []);

  if (!data || !streak) return null;

  const current = getCurrentBadge(data.currentStreak);
  const next = getNextBadge(data.currentStreak);
  const progress = next ? (data.currentStreak / next.day) : 1;

  // Split badges into milestones and long-game
  const earlyBadges = STREAK_BADGES.filter(b => b.day <= 30);
  const longBadges = STREAK_BADGES.filter(b => b.day > 30);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Your Streak</Text>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {/* Hero */}
        <FadeIn>
          <View style={s.heroCard}>
            <Text style={s.heroEmoji}>{current?.emoji || '🌱'}</Text>
            <Text style={s.heroNum}>{data.currentStreak}</Text>
            <Text style={s.heroLabel}>{data.currentStreak === 1 ? 'day' : 'days'} in a row</Text>
            {current && <Text style={s.heroBadgeName}>{current.name}</Text>}
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statVal}>{data.longestStreak}</Text>
                <Text style={s.statLabel}>Best</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBox}>
                <Text style={s.statVal}>{data.unlockedBadges.length}</Text>
                <Text style={s.statLabel}>Badges</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBox}>
                <Text style={[s.statVal, streak.freezesAvailable > 0 ? s.freezeActive : s.freezeUsed]}>
                  {streak.freezesAvailable > 0 ? '❄️' : '—'}
                </Text>
                <Text style={s.statLabel}>Freeze</Text>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* Streak freeze info */}
        <FadeIn delay={100}>
          <View style={s.freezeCard}>
            <Text style={s.freezeIcon}>❄️</Text>
            <View style={s.freezeInfo}>
              <Text style={s.freezeTitle}>Streak Freeze</Text>
              <Text style={s.freezeDesc}>
                {streak.freezesAvailable > 0
                  ? 'You have 1 free freeze this week. If you miss a day, your streak is safe.'
                  : 'Freeze used this week. Resets Monday. Don\'t break your streak!'}
              </Text>
            </View>
          </View>
        </FadeIn>

        {/* Next badge */}
        {next && (
          <FadeIn delay={200}>
            <View style={s.nextCard}>
              <View style={s.nextTop}>
                <Text style={s.nextEmoji}>{next.emoji}</Text>
                <View style={s.nextInfo}>
                  <Text style={s.nextName}>{next.name}</Text>
                  <Text style={s.nextDays}>{next.day - data.currentStreak} more {next.day - data.currentStreak === 1 ? 'day' : 'days'} to unlock</Text>
                </View>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
              </View>
            </View>
          </FadeIn>
        )}

        {/* Journey grid — show up to max unlocked + next badge range */}
        <Text style={s.section}>Journey</Text>
        <FadeIn delay={300}>
          <View style={s.gridCard}>
            <View style={s.grid}>
              {Array.from({ length: Math.max(30, data.currentStreak + 5) }, (_, i) => {
                const day = i + 1;
                const completed = day <= data.currentStreak;
                const badge = STREAK_BADGES.find(b => b.day === day);
                const unlocked = data.unlockedBadges.includes(day);
                const isToday = day === data.currentStreak;
                const isFrozen = streak.freezesUsed.includes(
                  new Date(Date.now() - (data.currentStreak - day) * 86400000).toISOString().split('T')[0]
                );

                return (
                  <View key={day} style={[
                    s.gridCell,
                    badge && s.gridCellBadge,
                    completed && s.gridCellDone,
                    isFrozen && s.gridCellFrozen,
                    isToday && s.gridCellToday,
                  ]}>
                    {badge ? (
                      <Text style={[s.gridBadgeEmoji, !unlocked && s.gridLocked]}>
                        {unlocked ? badge.emoji : '?'}
                      </Text>
                    ) : isFrozen ? (
                      <Text style={s.gridFreezeEmoji}>❄️</Text>
                    ) : (
                      <Text style={[s.gridDay, completed && s.gridDayDone]}>{day}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </FadeIn>

        {/* Early badges (1-30) */}
        <Text style={s.section}>First 30 Days</Text>
        {earlyBadges.map((badge) => {
          const unlocked = data.unlockedBadges.includes(badge.day);
          return (
            <FadeIn key={badge.day} delay={0}>
              <View style={[s.badgeRow, !unlocked && s.badgeLocked]}>
                <View style={[s.badgeIcon, unlocked ? s.badgeIconUnlocked : s.badgeIconLocked]}>
                  <Text style={s.badgeEmoji}>{unlocked ? badge.emoji : '🔒'}</Text>
                </View>
                <View style={s.badgeInfo}>
                  <Text style={[s.badgeName, !unlocked && s.badgeNameLocked]}>{badge.name}</Text>
                  <Text style={[s.badgeDesc, !unlocked && s.badgeDescLocked]}>{badge.description}</Text>
                </View>
                <Text style={[s.badgeDay, unlocked && s.badgeDayUnlocked]}>Day {badge.day}</Text>
              </View>
            </FadeIn>
          );
        })}

        {/* Long game badges (45+) */}
        <Text style={s.section}>The Long Game</Text>
        <Text style={s.longGameHint}>Most people never get here. Will you?</Text>
        {longBadges.map((badge) => {
          const unlocked = data.unlockedBadges.includes(badge.day);
          return (
            <FadeIn key={badge.day} delay={0}>
              <View style={[s.badgeRow, !unlocked && s.badgeLocked]}>
                <View style={[s.badgeIcon, unlocked ? s.badgeIconUnlocked : s.badgeIconLocked]}>
                  <Text style={s.badgeEmoji}>{unlocked ? badge.emoji : '🔒'}</Text>
                </View>
                <View style={s.badgeInfo}>
                  <Text style={[s.badgeName, !unlocked && s.badgeNameLocked]}>{badge.name}</Text>
                  <Text style={[s.badgeDesc, !unlocked && s.badgeDescLocked]}>{badge.description}</Text>
                </View>
                <Text style={[s.badgeDay, unlocked && s.badgeDayUnlocked]}>Day {badge.day}</Text>
              </View>
            </FadeIn>
          );
        })}

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

  // Hero
  heroCard: { backgroundColor: colors.streak.bg, borderWidth: 1.5, borderColor: colors.streak.border, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', marginBottom: spacing.md, ...shadows.md },
  heroEmoji: { fontSize: fp(40), marginBottom: spacing.sm },
  heroNum: { fontSize: fp(56), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: -2 },
  heroLabel: { fontSize: typography.size.sm, color: colors.text.tertiary, fontWeight: typography.weight.semibold },
  heroBadgeName: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.streak.gold, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.primary },
  statLabel: { fontSize: fp(9), color: colors.text.muted, fontWeight: typography.weight.semibold, marginTop: 2 },
  statDivider: { width: 1, height: wp(24), backgroundColor: colors.borderLight },
  freezeActive: { color: colors.text.primary },
  freezeUsed: { color: colors.text.muted },

  // Freeze card
  freezeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.sm },
  freezeIcon: { fontSize: fp(20) },
  freezeInfo: { flex: 1 },
  freezeTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  freezeDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginTop: 2 },

  // Next badge
  nextCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.sm },
  nextTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  nextEmoji: { fontSize: fp(28) },
  nextInfo: { flex: 1 },
  nextName: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  nextDays: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 2 },
  progressTrack: { height: wp(6), backgroundColor: colors.borderLight, borderRadius: wp(3), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent.primary, borderRadius: wp(3) },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md, marginTop: spacing.lg },
  longGameHint: { fontSize: typography.size.xs, color: colors.text.tertiary, marginBottom: spacing.md, fontStyle: 'italic' },

  // Grid
  gridCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(5), justifyContent: 'center' },
  gridCell: { width: wp(38), height: wp(38), borderRadius: wp(19), backgroundColor: colors.bg.tertiary, alignItems: 'center', justifyContent: 'center' },
  gridCellBadge: { borderWidth: 2, borderColor: colors.streak.locked },
  gridCellDone: { backgroundColor: colors.accent.light },
  gridCellFrozen: { backgroundColor: colors.duel.bg },
  gridCellToday: { borderWidth: 2, borderColor: colors.accent.primary },
  gridDay: { fontSize: fp(9), fontWeight: typography.weight.semibold, color: colors.text.muted },
  gridDayDone: { color: colors.accent.primary },
  gridBadgeEmoji: { fontSize: fp(14) },
  gridFreezeEmoji: { fontSize: fp(12) },
  gridLocked: { opacity: 0.3 },

  // Badge rows
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm },
  badgeLocked: { opacity: 0.45 },
  badgeIcon: { width: wp(42), height: wp(42), borderRadius: wp(21), alignItems: 'center', justifyContent: 'center' },
  badgeIconUnlocked: { backgroundColor: colors.accent.light },
  badgeIconLocked: { backgroundColor: colors.bg.tertiary },
  badgeEmoji: { fontSize: fp(18) },
  badgeInfo: { flex: 1 },
  badgeName: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  badgeNameLocked: { color: colors.text.muted },
  badgeDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 1 },
  badgeDescLocked: { color: colors.text.muted },
  badgeDay: { fontSize: typography.size.xs, fontWeight: typography.weight.heavy, color: colors.text.muted },
  badgeDayUnlocked: { color: colors.accent.primary },

  bottomSpacer: { height: wp(50) },
});
