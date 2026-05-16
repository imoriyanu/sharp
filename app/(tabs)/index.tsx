import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, shadows, layout, wp, fp, getScoreColor } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getStreak, getSessions, hasCompletedDailyToday, getContext, getUserProfile, getCachedDailyQuestion, getActiveUpcomingEvents, daysUntilEvent, getEventReadiness } from '../../src/services/storage';
import { prefetchAudio, buildNaturalScript, getQuestionVoiceMode } from '../../src/services/tts';
import { isPremium, canDoOneShot, canDoThreaded, canDoIndustry, canDoConversation, checkPremiumStatus } from '../../src/services/premium';
import { FEATURES } from '../../src/constants/features';
import { getCurrentBadge, getNextBadge } from '../../src/constants/badges';
import { trackScreen } from '../../src/services/analytics';
import type { Streak, SessionSummary, UserContext, UserProfile, UpcomingEvent } from '../../src/types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Type emoji map for the Coming Up hero. Kept here (not in storage) because
// it's UI-layer styling, not data. Other screens (detail, onboarding) share
// their own copies so each owns its presentation independently.
const EVENT_EMOJI: Record<string, string> = {
  interview: '💼',
  pitch: '🚀',
  raise: '💰',
  review: '📋',
  feedback: '🎯',
  sales: '🤝',
  presentation: '🎤',
  difficult_convo: '💬',
  other: '✨',
};

// Countdown label for Coming Up cards. Returns a short, scannable label , 
// the detail screen has its own (more verbose) variant for headers. Kept
// here rather than in storage.ts because the wording is UI-specific.
function eventCountdownLabel(days: number): string {
  if (days < 0) {
    // Past events still appear briefly on Home before auto-passed marking
    // catches up. Invite the user to log the outcome.
    return 'Past. Log how it went';
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days away`;
  if (days < 14) return '1 week away';
  if (days < 30) return `${Math.round(days / 7)} weeks away`;
  if (days < 60) return '1 month away';
  return `${Math.round(days / 30)} months away`;
}

function bandColor(band: 'red' | 'amber' | 'green'): string {
  if (band === 'green') return colors.success;
  if (band === 'amber') return colors.daily.text;
  return colors.error;
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
  const [conversationLeft, setConversationLeft] = useState<number | null>(null);
  // Active "Coming Up" events + their readiness scores. Sorted by date asc
  // (soonest first). First entry is the primary event shown as the hero.
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [readinessById, setReadinessById] = useState<Record<string, { score: number; band: 'red' | 'amber' | 'green' }>>({});

  const loadingRef = useRef(false);
  // Tracks whether the screen is currently focused. Flipped false in cleanup
  // so slow async work (readiness scoring) can bail before writing to state.
  const mountedRef = useRef(true);
  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    if (loadingRef.current) return () => { mountedRef.current = false; };
    loadingRef.current = true;
    trackScreen('Home');
    // All 9 reads in a single Promise.all. Saves ~100-200ms on tab focus
    // by parallelising every storage + usage + premium check.
    loadAll().finally(() => { loadingRef.current = false; });
    return () => { mountedRef.current = false; };
  }, []));

  async function loadAll() {
    const [s, sess, dd, ctx, prof, os, th, ind, conv, events, _premium] = await Promise.all([
      getStreak(),
      getSessions(),
      hasCompletedDailyToday(),
      getContext(),
      getUserProfile(),
      canDoOneShot(),
      canDoThreaded(),
      canDoIndustry(),
      canDoConversation(),
      getActiveUpcomingEvents(),
      checkPremiumStatus(),
    ]);
    setStreak(s);
    setSessions(sess.slice(0, 5));
    setDailyDone(dd);
    setContext(ctx);
    setProfile(prof);
    setOneShotLeft(os.limit - os.used);
    setThreadedLeft(th.limit - th.used);
    setIndustryLeft(ind.limit - ind.used);
    setConversationLeft(conv.limit - conv.used);
    setUpcomingEvents(events);

    // Readiness scores per event (kept off the hot path so Home renders fast).
    // Promise.allSettled so a single bad event doesn't blank the rest. We
    // also guard each setState with a mountedRef check so a slow readiness
    // calculation can't write to an unmounted component.
    if (events.length > 0) {
      Promise.allSettled(events.map(e => getEventReadiness(e))).then(results => {
        if (!mountedRef.current) return;
        const map: Record<string, { score: number; band: 'red' | 'amber' | 'green' }> = {};
        events.forEach((e, i) => {
          const r = results[i];
          if (r.status === 'fulfilled') map[e.id] = { score: r.value.score, band: r.value.band };
          // If readiness for this event failed, leave it out of the map , 
          // the card renders ", " rather than a misleading score.
        });
        setReadinessById(map);
      });
    } else {
      // Clear readiness when all events are gone (e.g. user deleted last
      // event) so the map doesn't hold stale entries for removed events.
      setReadinessById({});
    }

    // Pre-fetch daily challenge audio so it plays instantly when user taps Daily 30
    if (!dd) {
      getCachedDailyQuestion().then(cached => {
        if (cached?.question) prefetchAudio(buildNaturalScript(cached.question), getQuestionVoiceMode(cached.question));
      }).catch(() => {});
    }
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

        {/* Coming Up. The strategic hero. The first card is the "primary"
            event (soonest). Visually emphasised with the terracotta border so
            the eye lands there first. Practice queues map to it. */}
        {upcomingEvents.length > 0 && (
          <FadeIn delay={150}>
            <View style={st.upcomingHeader}>
              <Text style={[st.section, st.sectionInRow]}>Coming Up</Text>
              {upcomingEvents.length < 3 && (
                <TouchableOpacity onPress={() => router.push('/upcoming/new')} hitSlop={8} activeOpacity={0.6}>
                  <Text style={st.upcomingHeaderAdd}>＋ Add</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.upcomingScroll}
              snapToInterval={wp(310) + spacing.md}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {upcomingEvents.map((ev, idx) => {
                const days = daysUntilEvent(ev.eventDate);
                const readiness = readinessById[ev.id];
                const fillWidth = readiness ? `${Math.min(readiness.score * 10, 100)}%` : '0%';
                const fillColor = readiness ? bandColor(readiness.band) : colors.borderLight;
                const isPrimary = idx === 0;
                const urgency = days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'later';
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[st.upcomingCard, isPrimary && st.upcomingCardPrimary]}
                    onPress={() => router.push(`/upcoming/${ev.id}`)}
                    activeOpacity={0.88}
                  >
                    {/* Top row: icon in a tinted bubble + title + countdown chip */}
                    <View style={st.upcomingTop}>
                      <View style={[st.upcomingIconWrap, isPrimary && st.upcomingIconWrapPrimary]}>
                        <Text style={st.upcomingEmoji}>{EVENT_EMOJI[ev.type] || '✨'}</Text>
                      </View>
                      <View style={st.upcomingTopText}>
                        <Text style={st.upcomingTitle} numberOfLines={1}>{ev.title}</Text>
                        <View style={[
                          st.upcomingCountdownChip,
                          urgency === 'urgent' && st.upcomingCountdownChipUrgent,
                          urgency === 'later' && st.upcomingCountdownChipLater,
                        ]}>
                          <Text style={[
                            st.upcomingCountdownText,
                            urgency === 'urgent' && st.upcomingCountdownTextUrgent,
                            urgency === 'later' && st.upcomingCountdownTextLater,
                          ]}>{eventCountdownLabel(days)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Description (italic, muted). When set. When empty,
                        renders as a tinted action invitation so it reads as
                        a CTA, not stranded placeholder text. */}
                    {ev.description ? (
                      <Text style={st.upcomingDesc} numberOfLines={2}>{ev.description}</Text>
                    ) : (
                      <Text style={[st.upcomingDesc, st.upcomingDescEmpty]} numberOfLines={1}>＋ Add specifics</Text>
                    )}

                    {/* Readiness bar. Full-width with score on its own line */}
                    <View style={st.upcomingReadinessBlock}>
                      <View style={st.upcomingReadinessTopRow}>
                        <Text style={st.upcomingReadinessLabel}>Readiness</Text>
                        <Text style={[st.upcomingReadinessVal, { color: fillColor }]}>
                          {readiness ? `${readiness.score.toFixed(1)} / 10` : ', '}
                        </Text>
                      </View>
                      <View style={st.upcomingBarTrack}>
                        <View style={[st.upcomingBarFill, { width: fillWidth as any, backgroundColor: fillColor }]} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </FadeIn>
        )}

        {/* Empty state. First-time invitation. More visual than the cards
            above; lives between streak and Daily so it lands as the second
            thing the user reads. */}
        {upcomingEvents.length === 0 && (
          <FadeIn delay={150}>
            <TouchableOpacity style={st.upcomingEmpty} onPress={() => router.push('/upcoming/new')} activeOpacity={0.75}>
              <View style={st.upcomingEmptyIconWrap}>
                <Text style={st.upcomingEmptyEmoji}>🎯</Text>
              </View>
              <View style={st.upcomingEmptyText}>
                <Text style={st.upcomingEmptyLabel}>COMING UP</Text>
                <Text style={st.upcomingEmptyTitle}>What's the conversation that matters?</Text>
                <Text style={st.upcomingEmptyDesc}>Add an interview, pitch, or hard chat. Sharp will bias every practice toward it.</Text>
              </View>
              <Text style={st.upcomingEmptyArrow}>→</Text>
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
                  {dailyDone ? 'Completed today. Nice work' : "Today's question is ready"}
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

        {/* Practice modes. Section label on its own line, quota strip as
            a quiet subtitle below. Cleaner hierarchy than competing on the
            same row, which got cramped at small font sizes. */}
        <View style={st.practiceHeader}>
          <Text style={[st.section, st.sectionInRow]}>Practice</Text>
        </View>
        {(oneShotLeft !== null && threadedLeft !== null && industryLeft !== null) && (
          isPremium() ? (
            <Text style={st.quotaStrip}>
              {oneShotLeft} One Shot · {threadedLeft} Threaded · {industryLeft} Industry{FEATURES.conversation ? ` · ${conversationLeft ?? 0} Voice` : ''} left today
            </Text>
          ) : (
            <Text style={st.quotaStrip}>
              {oneShotLeft > 0 ? `${oneShotLeft} free One Shot${oneShotLeft === 1 ? '' : 's'} this week` : 'Free quota used'} · Daily &amp; Duels stay free
            </Text>
          )
        )}
        <FadeIn delay={300}>
          <View style={st.practiceGrid}>
            {/* Row 1: One Shot + Threaded */}
            <View style={st.practiceRow}>
              <TouchableOpacity style={[st.modeCard, oneShotLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const check = await canDoOneShot();
                if (check.allowed) router.push('/one-shot/question');
                else if (!isPremium()) router.push('/premium');
              }} activeOpacity={0.7}>
                <View style={st.modeIconWrap}><Text style={st.modeIcon}>⚡</Text></View>
                <Text style={st.modeTitle}>One Shot</Text>
                <Text style={st.modeDesc}>Full scored session</Text>
                <View style={st.modeDurBadge}>
                  <Text style={st.modeDur}>{oneShotLeft !== null && oneShotLeft > 0 ? `${oneShotLeft} left today` : oneShotLeft === 0 ? (isPremium() ? 'Limit reached' : 'Upgrade for more') : '2-3 min'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modeCard, !isPremium() ? st.modeCardLocked : threadedLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                if (!isPremium()) { router.push('/premium'); return; }
                const check = await canDoThreaded();
                if (check.allowed) router.push('/one-shot/question?mode=threaded');
              }} activeOpacity={0.7}>
                <View style={[st.modeIconWrap, st.modeIconThreaded]}><Text style={st.modeIcon}>⚓</Text></View>
                <Text style={st.modeTitle}>Threaded</Text>
                <Text style={st.modeDesc}>3 follow-ups</Text>
                <View style={st.modeDurBadge}>
                  <Text style={st.modeDur}>{!isPremium() ? 'Pro' : threadedLeft !== null && threadedLeft > 0 ? `${threadedLeft} left today` : threadedLeft === 0 ? 'Limit reached' : '5-8 min'}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Row 2: Industry */}
            <View style={st.practiceRow}>
              {isPremium() && (context?.currentCompany || context?.roleText) ? (
                <TouchableOpacity style={[st.modeCard, industryLeft === 0 && st.modeCardDimmed]} onPress={async () => {
                  const check = await canDoIndustry();
                  if (check.allowed) router.push('/one-shot/question?mode=industry');
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
                  <View style={st.modeDurBadge}>
                    <Text style={st.modeDur}>Pro</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Row 3: Live voice Conversation. Pro-only, 1/day */}
            {FEATURES.conversation && (
              <View style={st.practiceRow}>
                <TouchableOpacity
                  style={[
                    st.modeCard,
                    st.modeCardWide,
                    !isPremium() ? st.modeCardLocked : conversationLeft === 0 && st.modeCardDimmed,
                  ]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!isPremium()) { router.push('/premium'); return; }
                    const check = await canDoConversation();
                    if (check.allowed) router.push('/conversation/setup');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[st.modeIconWrap, st.modeIconConversation]}><Text style={st.modeIcon}>💬</Text></View>
                  <Text style={st.modeTitle}>Conversation</Text>
                  <Text style={st.modeDesc}>Live voice back-and-forth with an AI agent</Text>
                  <View style={st.modeDurBadge}>
                    <Text style={st.modeDur}>
                      {!isPremium()
                        ? 'Pro'
                        : conversationLeft !== null && conversationLeft > 0
                          ? `${conversationLeft} left today`
                          : conversationLeft === 0
                            ? 'Daily limit reached'
                            : '5 min'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
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
                  <Text style={st.progressSub}>{isPremium() ? 'Hear your 30-second progress review' : 'Track your scores and see what\'s improving'}</Text>
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
                  <Text style={st.ctxEmptyDesc}>{isPremium() ? 'Add your role, company, and goals for personalised coaching' : 'Tell Sharp about your role and goals for questions tailored to you'}</Text>
                </View>
                {isPremium() ? <Text style={st.ctxEdit}>→</Text> : <View style={st.proBadgeSm}><Text style={st.proBadgeSmText}>PRO</Text></View>}
              </View>
            )}
          </TouchableOpacity>
        </FadeIn>

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={st.section}>Recent Sessions</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7}>
                <Text style={{ fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary }}>View all</Text>
              </TouchableOpacity>
            </View>
            <FadeIn delay={600}>
              <View style={st.recentCard}>
                {sessions.map((sess, i) => (
                  <TouchableOpacity key={sess.id} style={[st.sessRow, i < sessions.length - 1 && st.sessBorder]} onPress={() => router.push(`/session/${sess.id}`)}>
                    <View style={[st.sessTypeDot, { backgroundColor:
                      sess.type === 'daily_30' ? colors.daily.text
                      : sess.type === 'threaded' ? colors.success
                      : sess.type === 'conversation' ? colors.duel.text
                      : colors.accent.primary
                    }]} />
                    <View style={st.sessInfo}>
                      <Text style={st.sessTitle}>
                        {sess.type === 'daily_30' ? 'Daily'
                          : sess.type === 'threaded' ? 'Threaded'
                          : sess.type === 'conversation' ? 'Voice'
                          : 'One Shot'}
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

  // Header. Tighter when no streak strip is present, so Coming Up isn't
  // floating in dead space. Streak strip below adds its own margin when
  // visible, restoring the previous breathing room.
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  headerLeft: { flex: 1 },
  greetLine: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary, letterSpacing: 0.3 },
  greetName: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.8, marginTop: wp(2) },
  avatarWrap: { marginLeft: spacing.md },
  avatar: { width: wp(46), height: wp(46), borderRadius: wp(23), borderWidth: 2.5, borderColor: colors.accent.light },
  avatarPlaceholder: { width: wp(46), height: wp(46), borderRadius: wp(23), backgroundColor: colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: fp(18), fontWeight: typography.weight.black, color: colors.text.inverse },

  // Streak strip
  streakStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.streak.bg, borderWidth: 1.5, borderColor: colors.streak.border, borderRadius: radius.lg, padding: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },

  // Coming Up. Header row with section label + inline Add link.
  upcomingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.sm },
  upcomingHeaderAdd: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },

  // Cards. Each ~305dp so 1 fits comfortably with a meaningful peek of the
  // next card (gap + paddingRight together expose ~32dp of card #2). Primary
  // card (idx 0) gets a terracotta border to emphasise it.
  upcomingScroll: { gap: spacing.md, paddingRight: wp(50) },
  upcomingCard: {
    width: wp(305),
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.md,
  },
  upcomingCardPrimary: { borderColor: colors.accent.border, ...shadows.lg },

  upcomingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  upcomingIconWrap: {
    width: wp(46), height: wp(46), borderRadius: wp(14),
    backgroundColor: colors.bg.tertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  upcomingIconWrapPrimary: { backgroundColor: colors.accent.light },
  upcomingEmoji: { fontSize: fp(22) },
  upcomingTopText: { flex: 1, gap: wp(4) },
  upcomingTitle: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.2 },

  // Countdown chip. Urgency-coded background. Urgent (≤3d) = terracotta,
  // soon (4-14d) = neutral cream, later (>14d) = muted grey.
  upcomingCountdownChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: wp(10), paddingVertical: wp(3),
    backgroundColor: colors.daily.bg,
  },
  upcomingCountdownChipUrgent: { backgroundColor: colors.accent.light },
  upcomingCountdownChipLater: { backgroundColor: colors.bg.tertiary },
  upcomingCountdownText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.daily.text },
  upcomingCountdownTextUrgent: { color: colors.accent.primary },
  upcomingCountdownTextLater: { color: colors.text.muted },

  upcomingDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18), marginBottom: spacing.md, fontStyle: 'italic' },
  // Empty-description state. A dashed inline link that reads as an action,
  // not as a stranded placeholder. Tints to accent so eye picks it up.
  upcomingDescEmpty: {
    color: colors.accent.primary,
    fontStyle: 'normal' as const,
    fontWeight: typography.weight.semibold,
  },

  upcomingReadinessBlock: { marginTop: 'auto', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  upcomingReadinessTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: wp(6) },
  upcomingReadinessLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.2 },
  upcomingReadinessVal: { fontSize: typography.size.xs, fontWeight: typography.weight.black },
  upcomingBarTrack: { height: wp(6), backgroundColor: colors.borderLight, borderRadius: wp(3), overflow: 'hidden' },
  upcomingBarFill: { height: '100%', borderRadius: wp(3) },

  // Empty state (no active events). More visual + emotionally inviting
  upcomingEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.accent.border,
    ...shadows.sm,
  },
  upcomingEmptyIconWrap: {
    width: wp(48), height: wp(48), borderRadius: wp(14),
    backgroundColor: colors.accent.light,
    alignItems: 'center', justifyContent: 'center',
  },
  upcomingEmptyEmoji: { fontSize: fp(22) },
  upcomingEmptyText: { flex: 1 },
  upcomingEmptyLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 2 },
  upcomingEmptyTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.black, color: colors.text.primary, lineHeight: fp(20) },
  upcomingEmptyDesc: { fontSize: fp(11), color: colors.text.tertiary, marginTop: 3, lineHeight: fp(16) },
  upcomingEmptyArrow: { fontSize: typography.size.md, color: colors.accent.primary, fontWeight: typography.weight.bold },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streakEmoji: { fontSize: fp(22) },
  streakCount: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  streakNext: { fontSize: fp(10), color: colors.text.tertiary, marginTop: 1 },
  streakArrow: { fontSize: typography.size.md, color: colors.accent.primary },

  // Section labels. Used across all home sections. xxl top margin gives
  // each block visual breathing room. sectionInRow zeros margin when the
  // label is wrapped inside a flex-row container that manages its own
  // margins (e.g. upcomingHeader, practiceHeader).
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionInRow: { marginTop: 0, marginBottom: 0 },
  practiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.xxl, marginBottom: spacing.xs },
  // Quota strip. A quiet subtitle UNDER the section label. Left-aligned
  // reads better than right-aligned at small text sizes (the eye naturally
  // tracks left from the section label above).
  quotaStrip: { fontSize: fp(10), color: colors.text.tertiary, fontWeight: typography.weight.semibold, marginBottom: spacing.md },

  // Daily hero. Same inter-card gap as the rest of Home (spacing.md = 16dp).
  // Consistent rhythm with the Coming Up → Daily and Daily → Practice spacing.
  dailyHero: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginTop: spacing.md, ...shadows.lg },
  dailyDone: { opacity: 0.7, borderColor: colors.success, borderWidth: 1.5 },
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
  modeIconConversation: { backgroundColor: colors.duel.bg },
  modeCardWide: { flex: 1 },
  modeIcon: { fontSize: fp(22) },
  modeTitle: { fontSize: typography.size.base, fontWeight: typography.weight.black, color: colors.text.primary },
  modeDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: wp(3) },
  modeDurBadge: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3), marginTop: spacing.md },
  modeDur: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted },

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
  ctxChipText: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },
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
