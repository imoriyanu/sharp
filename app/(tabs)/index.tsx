import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getStreak, getSessions, hasCompletedDailyToday, getContext, getUserProfile } from '../../src/services/storage';
import { isPremium, canDoOneShot, canDoThreaded, canDoIndustry, checkPremiumStatus } from '../../src/services/premium';
import { getCurrentBadge, getNextBadge } from '../../src/constants/badges';
import type { Streak, SessionSummary, UserContext, UserProfile } from '../../src/types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const [streak, setStreak] = useState<Streak>({ currentStreak: 0, longestStreak: 0, lastSessionDate: null, freezesUsed: [], freezesAvailable: 1 });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [dailyDone, setDailyDone] = useState(false);
  const [context, setContext] = useState<UserContext | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [oneShotLeft, setOneShotLeft] = useState<number | null>(null);
  const [threadedLeft, setThreadedLeft] = useState<number | null>(null);
  const [industryLeft, setIndustryLeft] = useState<number | null>(null);

  useFocusEffect(useCallback(() => { checkPremiumStatus(); loadData(); loadUsage(); }, []));

  async function loadUsage() {
    const [os, th, ind] = await Promise.all([canDoOneShot(), canDoThreaded(), canDoIndustry()]);
    setOneShotLeft(os.limit - os.used);
    setThreadedLeft(th.limit - th.used);
    setIndustryLeft(ind.limit - ind.used);
  }

  async function loadData() {
    const [s, sess, dd, ctx, prof] = await Promise.all([
      getStreak(), getSessions(), hasCompletedDailyToday(), getContext(), getUserProfile(),
    ]);
    setStreak(s);
    setSessions(sess.slice(0, 3));
    setDailyDone(dd);
    setContext(ctx);
    setProfile(prof);
  }

  const currentBadge = getCurrentBadge(streak.currentStreak);
  const nextBadge = getNextBadge(streak.currentStreak);

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeIn>
          <View style={st.header}>
            <View style={st.headerLeft}>
              <Text style={st.greetLine}>{getGreeting()}</Text>
              <Text style={st.greetName} numberOfLines={1}>{profile?.displayName || 'Sharp'}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.7} style={st.avatarWrap}>
              {profile?.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={st.avatar} />
              ) : (
                <View style={st.avatarPlaceholder}>
                  <Text style={st.avatarInitial}>{profile?.displayName?.[0]?.toUpperCase() || 'S'}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </FadeIn>

        {/* Streak strip */}
        {streak.currentStreak > 0 && (
          <FadeIn delay={100}>
            <TouchableOpacity style={st.streakStrip} onPress={() => router.push('/streak')} activeOpacity={0.7}>
              <View style={st.streakLeft}>
                <Text style={st.streakEmoji}>{currentBadge?.emoji || '🔥'}</Text>
                <View>
                  <Text style={st.streakCount}>{streak.currentStreak} day streak</Text>
                  {nextBadge && <Text style={st.streakNext}>{nextBadge.emoji} {nextBadge.name} in {nextBadge.day - streak.currentStreak}d</Text>}
                </View>
              </View>
              <Text style={st.streakArrow}>→</Text>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* Daily Challenge Hero */}
        <FadeIn delay={200}>
          <TouchableOpacity
            style={[st.dailyHero, dailyDone && st.dailyDone]}
            onPress={() => !dailyDone && router.push('/daily/challenge')}
            activeOpacity={0.8}
          >
            <View style={st.dailyTop}>
              <View style={st.dailyIconWrap}>
                <Text style={st.dailyEmoji}>{dailyDone ? '✅' : '☀️'}</Text>
              </View>
              <View style={st.dailyTextWrap}>
                <Text style={st.dailyTitle}>Daily Challenge</Text>
                <Text style={st.dailySub}>
                  {dailyDone ? 'Completed today — nice work' : "Today's question is ready"}
                </Text>
              </View>
            </View>
            {!dailyDone && (
              <View style={st.dailyCta}>
                <Text style={st.dailyCtaText}>Start challenge</Text>
                <Text style={st.dailyCtaArrow}>→</Text>
              </View>
            )}
          </TouchableOpacity>
        </FadeIn>

        {/* Practice modes */}
        <Text style={st.section}>Practice</Text>
        <FadeIn delay={300}>
          <View style={st.practiceGrid}>
            {/* Row 1: One Shot + Threaded */}
            <View style={st.practiceRow}>
              <TouchableOpacity style={[st.modeCard, oneShotLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                const check = await canDoOneShot();
                if (check.allowed) router.push('/one-shot/question');
                else if (!isPremium()) router.push('/premium');
                // Pro users: card is dimmed, "Limit reached" shown — no action needed
              }} activeOpacity={oneShotLeft === 0 && isPremium() ? 1 : 0.7}>
                <View style={st.modeIconWrap}><Text style={st.modeIcon}>⚡</Text></View>
                <Text style={st.modeTitle}>One Shot</Text>
                <Text style={st.modeDesc}>Full scored session</Text>
                <View style={st.modeDurBadge}>
                  <Text style={st.modeDur}>{oneShotLeft !== null && oneShotLeft > 0 ? `${oneShotLeft} left today` : oneShotLeft === 0 ? 'Limit reached' : '2-3 min'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modeCard, threadedLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                const check = await canDoThreaded();
                if (check.allowed) router.push('/one-shot/question?mode=threaded');
                else if (!isPremium()) router.push('/premium');
              }} activeOpacity={threadedLeft === 0 && isPremium() ? 1 : 0.7}>
                <View style={[st.modeIconWrap, st.modeIconThreaded]}><Text style={st.modeIcon}>⚓</Text></View>
                <Text style={st.modeTitle}>Threaded</Text>
                <Text style={st.modeDesc}>3 follow-ups</Text>
                <View style={st.modeDurBadge}>
                  <Text style={st.modeDur}>{threadedLeft !== null && threadedLeft > 0 ? `${threadedLeft} left` : threadedLeft === 0 ? 'Limit reached' : '5-8 min'}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Row 2: Industry (Pro + context only) + Conversations */}
            <View style={st.practiceRow}>
              {isPremium() && (context?.currentCompany || context?.roleText) ? (
                <TouchableOpacity style={[st.modeCard, industryLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                  const check = await canDoIndustry();
                  if (check.allowed) router.push('/one-shot/question?mode=industry');
                  // Pro users: card is dimmed — no paywall
                }} activeOpacity={industryLeft === 0 ? 1 : 0.7}>
                  <View style={[st.modeIconWrap, st.modeIconIndustry]}><Text style={st.modeIcon}>📰</Text></View>
                  <Text style={st.modeTitle}>Industry</Text>
                  <Text style={st.modeDesc}>Real-world topics</Text>
                  <View style={st.modeDurBadge}>
                    <Text style={st.modeDur}>{industryLeft !== null && industryLeft > 0 ? `${industryLeft} left today` : industryLeft === 0 ? 'Limit reached' : '1-2 min'}</Text>
                  </View>
                </TouchableOpacity>
              ) : isPremium() ? (
                <TouchableOpacity style={[st.modeCard, st.modeCardDimmed]} onPress={() => router.push('/context/setup')} activeOpacity={0.7}>
                  <View style={[st.modeIconWrap, st.modeIconIndustry]}><Text style={st.modeIcon}>📰</Text></View>
                  <Text style={st.modeTitle}>Industry</Text>
                  <Text style={st.modeDesc}>Real-world topics</Text>
                  <View style={st.modeDurBadge}>
                    <Text style={st.modeDur}>Set up context</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[st.modeCard, st.modeCardLocked]} onPress={() => router.push('/premium')} activeOpacity={0.7}>
                  <View style={[st.modeIconWrap, st.modeIconIndustry]}><Text style={st.modeIcon}>📰</Text></View>
                  <Text style={st.modeTitle}>Industry</Text>
                  <Text style={st.modeDesc}>Real-world topics</Text>
                  <View style={st.proBadgeSm}><Text style={st.proBadgeSmText}>PRO</Text></View>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[st.modeCard, st.modeCardLocked]} onPress={() => router.push('/coming-soon/conversation')} activeOpacity={0.7}>
                <View style={[st.modeIconWrap, { backgroundColor: colors.bg.tertiary }]}><Text style={st.modeIcon}>💬</Text></View>
                <Text style={st.modeTitle}>Convo</Text>
                <Text style={st.modeDesc}>Live practice</Text>
                <View style={st.modeDurBadge}>
                  <Text style={st.modeDur}>Coming soon</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </FadeIn>

        {/* Progress / Analytics */}
        {sessions.length >= 2 && (
          <FadeIn delay={450}>
            <TouchableOpacity style={[st.progressCard, !isPremium() && st.lockedFeature]} onPress={() => isPremium() ? router.push('/analytics') : router.push('/premium')} activeOpacity={0.7}>
              <View style={st.progressLeft}>
                <View style={st.progressIconWrap}><Text style={st.progressIcon}>📊</Text></View>
                <View style={st.progressText}>
                  <Text style={st.progressTitle}>Sharp Summary</Text>
                  <Text style={st.progressSub}>{isPremium() ? 'Hear your 30-second progress review' : 'Upgrade to unlock'}</Text>
                </View>
              </View>
              {isPremium() ? <Text style={st.progressArrow}>→</Text> : <View style={st.proBadgeSm}><Text style={st.proBadgeSmText}>PRO</Text></View>}
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* Context card */}
        <Text style={st.section}>Your Context</Text>
        <FadeIn delay={500}>
          <TouchableOpacity style={[st.ctxCard, !isPremium() && st.lockedFeature]} onPress={() => isPremium() ? router.push('/context/setup') : router.push('/premium')} activeOpacity={0.7}>
            {context?.currentCompany ? (
              <>
                <View style={st.ctxHeader}>
                  <View style={st.ctxIconWrap}><Text style={st.ctxIcon}>🎯</Text></View>
                  <Text style={st.ctxCompany}>{context.currentCompany}</Text>
                  <Text style={st.ctxEdit}>Edit →</Text>
                </View>
                {context.situationText ? <Text style={st.ctxSituation} numberOfLines={2}>{context.situationText}</Text> : null}
                <View style={st.ctxMeta}>
                  {context.roleText ? <View style={st.ctxChip}><Text style={st.ctxChipText}>Role set</Text></View> : null}
                  {context.dreamRoleAndCompany ? <View style={st.ctxChip}><Text style={st.ctxChipText}>Dream role set</Text></View> : null}
                  {context.documents.length > 0 && <View style={st.ctxChip}><Text style={st.ctxChipText}>{context.documents.length} doc{context.documents.length !== 1 ? 's' : ''}</Text></View>}
                </View>
              </>
            ) : (
              <View style={st.ctxEmpty}>
                <View style={st.ctxIconWrap}><Text style={st.ctxIcon}>{isPremium() ? '📋' : '🔒'}</Text></View>
                <View style={st.ctxEmptyText}>
                  <Text style={st.ctxEmptyTitle}>{isPremium() ? 'Set up your context' : 'Custom Context'}</Text>
                  <Text style={st.ctxEmptyDesc}>{isPremium() ? 'Add your role, company, and goals for personalised coaching' : 'Upgrade to Pro to personalise your coaching'}</Text>
                </View>
                {isPremium() ? <Text style={st.ctxEdit}>→</Text> : <View style={st.proBadgeSm}><Text style={st.proBadgeSmText}>PRO</Text></View>}
              </View>
            )}
          </TouchableOpacity>
        </FadeIn>

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <>
            <Text style={st.section}>Recent Sessions</Text>
            <FadeIn delay={600}>
              <View style={st.recentCard}>
                {sessions.map((sess, i) => (
                  <TouchableOpacity key={sess.id} style={[st.sessRow, i < sessions.length - 1 && st.sessBorder]} onPress={() => router.push(`/session/${sess.id}`)}>
                    <View style={[st.sessTypeDot, { backgroundColor: sess.type === 'daily_30' ? colors.daily.text : sess.type === 'threaded' ? colors.success : colors.accent.primary }]} />
                    <View style={st.sessInfo}>
                      <Text style={st.sessTitle}>
                        {sess.type === 'daily_30' ? 'Daily' : sess.type === 'threaded' ? 'Threaded' : 'One Shot'}
                      </Text>
                      <Text style={st.sessMeta}>{new Date(sess.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {sess.turnCount} turn{sess.turnCount !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={[st.sessScore, { color: getScoreColor(sess.overall) }]}>{sess.overall.toFixed(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        <View style={st.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: layout.screenPadding, paddingTop: wp(8) },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl },
  headerLeft: { flex: 1 },
  greetLine: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary, letterSpacing: 0.3 },
  greetName: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.8, marginTop: wp(2) },
  avatarWrap: { marginLeft: spacing.md },
  avatar: { width: wp(46), height: wp(46), borderRadius: wp(23), borderWidth: 2.5, borderColor: colors.accent.light },
  avatarPlaceholder: { width: wp(46), height: wp(46), borderRadius: wp(23), backgroundColor: colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.inverse },

  // Streak strip
  streakStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.streak.bg, borderWidth: 1.5, borderColor: colors.streak.border, borderRadius: radius.lg, padding: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streakEmoji: { fontSize: fp(22) },
  streakCount: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  streakNext: { fontSize: fp(10), color: colors.text.tertiary, marginTop: 1 },
  streakArrow: { fontSize: typography.size.md, color: colors.accent.primary },

  // Section labels
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.xxl, marginBottom: spacing.md },

  // Daily hero
  dailyHero: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, ...shadows.lg },
  dailyDone: { opacity: 0.5 },
  dailyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  dailyIconWrap: { width: wp(50), height: wp(50), borderRadius: wp(16), backgroundColor: colors.daily.bg, alignItems: 'center', justifyContent: 'center' },
  dailyEmoji: { fontSize: fp(24) },
  dailyTextWrap: { flex: 1 },
  dailyTitle: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary },
  dailySub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: wp(3) },
  dailyCta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent.primary, paddingVertical: wp(14), borderRadius: radius.lg, marginTop: spacing.lg, ...shadows.accent },
  dailyCtaText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  dailyCtaArrow: { fontSize: typography.size.base, color: colors.text.inverse, opacity: 0.7 },

  // Practice grid
  practiceGrid: { gap: spacing.md },
  practiceRow: { flexDirection: 'row', gap: spacing.md },
  modeCard: { flex: 1, backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, paddingVertical: spacing.xl, alignItems: 'center', ...shadows.md },
  modeCardDimmed: { opacity: 0.45 },
  modeCardLocked: { opacity: 0.5 },
  modeIconWrap: { width: wp(48), height: wp(48), borderRadius: wp(14), backgroundColor: colors.accent.light, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  modeIconThreaded: { backgroundColor: colors.feedback.positiveBg },
  modeIconIndustry: { backgroundColor: colors.industry.bg },
  modeIcon: { fontSize: fp(22) },
  modeTitle: { fontSize: typography.size.base, fontWeight: typography.weight.black, color: colors.text.primary },
  modeDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: wp(3) },
  modeDurBadge: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3), marginTop: spacing.md },
  modeDur: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted },

  // Progress card
  progressCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.lg, ...shadows.md },
  progressLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  progressIconWrap: { width: wp(40), height: wp(40), borderRadius: wp(12), backgroundColor: colors.feedback.positiveBg, alignItems: 'center', justifyContent: 'center' },
  progressIcon: { fontSize: fp(18) },
  progressText: { flex: 1 },
  progressTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  progressSub: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 1 },
  progressArrow: { fontSize: typography.size.md, color: colors.accent.primary },

  // Context card
  ctxCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md },
  ctxHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ctxIconWrap: { width: wp(32), height: wp(32), borderRadius: wp(10), backgroundColor: colors.accent.light, alignItems: 'center', justifyContent: 'center' },
  ctxIcon: { fontSize: fp(14) },
  ctxCompany: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary, flex: 1 },
  ctxEdit: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },
  ctxSituation: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginTop: spacing.sm },
  ctxMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ctxChip: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  ctxChipText: { fontSize: fp(9), color: colors.text.muted, fontWeight: typography.weight.semibold },
  ctxEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ctxEmptyText: { flex: 1 },
  ctxEmptyTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  ctxEmptyDesc: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2 },

  // Recent sessions
  recentCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.sm },
  sessRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },
  sessBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  sessTypeDot: { width: wp(8), height: wp(8), borderRadius: wp(4) },
  sessInfo: { flex: 1 },
  sessTitle: { fontSize: typography.size.sm, color: colors.text.primary, fontWeight: typography.weight.semibold },
  sessMeta: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2 },
  sessScore: { fontSize: fp(20), fontWeight: typography.weight.black },

  // Premium gates
  lockedFeature: { opacity: 0.6 },
  proBadgeSm: { backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  proBadgeSmText: { fontSize: fp(8), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 1 },

  bottomSpacer: { height: wp(50) },
});
