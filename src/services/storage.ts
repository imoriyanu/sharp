import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserContext, UserProfile, Session, SessionSummary, Streak, StreakData, StreakUpdateResult, Duel, DailyResult, ComingSoonFeature, ActiveThread } from '../types';
import { STREAK_BADGES } from '../constants/badges';
import { syncProfileToCloud, syncContextToCloud, syncSessionToCloud, syncStreakToCloud, syncBadgeToCloud, syncDailyResultToCloud, migrateLocalToCloud } from './sync';

const KEYS = {
  CONTEXT: 'sharp:context',
  SESSIONS: 'sharp:sessions',
  SESSION_DETAIL: 'sharp:session:',
  DAILY_QUESTION_CACHE: 'sharp:daily_question_cache',
  RECENT_QUESTIONS: 'sharp:recent_questions',
  STREAK: 'sharp:streak',
  STREAK_HISTORY: 'sharp:streak_history',
  STREAK_BADGES: 'sharp:streak_badges',
  DAILY_HISTORY: 'sharp:daily_history',
  DAILY_LAST_DATE: 'sharp:daily_last_date',
  DUELS: 'sharp:duels',
  FEATURE_INTEREST: 'sharp:feature_interest',
  USER_PROFILE: 'sharp:user_profile',
  ACTIVE_THREAD: 'sharp:active_thread',
};

// ===== Cloud Migration =====

export async function runMigrationIfNeeded(): Promise<void> {
  const migrated = await AsyncStorage.getItem('sharp:cloud_migrated');
  if (migrated === 'true') return;

  const profile = await getUserProfile();
  const context = await getContext();
  const streak = await getStreak();
  const unlockedBadges = await getUnlockedBadges();
  const dailyResults = await getDailyHistory();

  // Load full sessions
  const summaries = await getSessions();
  const sessions: any[] = [];
  for (const s of summaries.slice(0, 50)) {
    const full = await getSessionById(s.id);
    if (full) sessions.push(full);
  }

  await migrateLocalToCloud({ profile, context, sessions, streak, unlockedBadges, dailyResults });
  await AsyncStorage.setItem('sharp:cloud_migrated', 'true');
}

// ===== Onboarding =====

export async function hasOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem('sharp:onboarded');
  return val === 'true';
}

export async function setOnboarded(): Promise<void> {
  await AsyncStorage.setItem('sharp:onboarded', 'true');
}

export async function getOnboardingStep(): Promise<number> {
  const val = await AsyncStorage.getItem('sharp:onboarding_step');
  return val ? parseInt(val) : 0;
}

export async function setOnboardingStep(step: number): Promise<void> {
  await AsyncStorage.setItem('sharp:onboarding_step', String(step));
}

// ===== User Profile =====

export async function getUserProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return { isPremium: false, ...parsed }; // Migration: add isPremium if missing
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
  syncProfileToCloud(profile).catch(() => {});
}

// ===== Context =====

export async function getContext(): Promise<UserContext | null> {
  const raw = await AsyncStorage.getItem(KEYS.CONTEXT);
  return raw ? JSON.parse(raw) : null;
}

export async function saveContext(context: UserContext): Promise<void> {
  await AsyncStorage.setItem(KEYS.CONTEXT, JSON.stringify(context));
  syncContextToCloud(context).catch(() => {});
}

// ===== Sessions =====

export async function getSessions(): Promise<SessionSummary[]> {
  const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveSession(session: Session): Promise<void> {
  const sessions = await getSessions();
  const summary: SessionSummary = {
    id: session.id,
    type: session.type,
    scenario: session.scenario,
    overall: session.turns[session.turns.length - 1]?.overall || 0,
    turnCount: session.turns.length,
    createdAt: session.createdAt,
  };
  sessions.unshift(summary);
  await Promise.all([
    AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions.slice(0, 100))),
    AsyncStorage.setItem(KEYS.SESSION_DETAIL + session.id, JSON.stringify(session)),
  ]);
  syncSessionToCloud(session).catch(() => {});
}

export async function getSessionById(id: string): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEYS.SESSION_DETAIL + id);
  return raw ? JSON.parse(raw) : null;
}

// ===== Streak =====

export async function getStreak(): Promise<Streak> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK);
  const defaults: Streak = { currentStreak: 0, longestStreak: 0, lastSessionDate: null, freezesUsed: [], freezesAvailable: 1 };
  if (!raw) return defaults;
  const parsed = JSON.parse(raw);
  // Migration: add freeze fields if missing
  return { ...defaults, ...parsed };
}

export async function getStreakHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK_HISTORY);
  return raw ? JSON.parse(raw) : [];
}

export async function getUnlockedBadges(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK_BADGES);
  return raw ? JSON.parse(raw) : [];
}

export async function getStreakData(): Promise<StreakData> {
  const [streak, history, badges] = await Promise.all([
    getStreak(),
    getStreakHistory(),
    getUnlockedBadges(),
  ]);
  return { ...streak, streakHistory: history, unlockedBadges: badges };
}

export async function updateStreak(): Promise<StreakUpdateResult> {
  const streak = await getStreak();
  const today = new Date().toISOString().split('T')[0];

  if (streak.lastSessionDate === today) {
    return { ...streak, newBadge: null };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

  if (streak.lastSessionDate === yesterday) {
    // Consecutive day — extend streak
    streak.currentStreak += 1;
  } else if (streak.lastSessionDate === twoDaysAgo && streak.freezesAvailable > 0 && streak.currentStreak > 0) {
    // Missed yesterday but have a freeze — auto-use it to save the streak
    streak.freezesUsed.push(yesterday);
    streak.freezesAvailable = Math.max(0, streak.freezesAvailable - 1);
    streak.currentStreak += 1; // Continue streak (freeze covered yesterday)
  } else {
    // Streak broken — reset
    streak.currentStreak = 1;
  }

  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
  streak.lastSessionDate = today;

  // Reset weekly freeze (every Monday)
  const now = new Date();
  if (now.getDay() === 1) { // Monday
    const lastMonday = new Date(now);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const recentFreezes = streak.freezesUsed.filter(d => d > lastMonday.toISOString().split('T')[0]);
    streak.freezesUsed = recentFreezes;
    streak.freezesAvailable = 1; // 1 free freeze per week
  }

  // Update streak history
  const history = await getStreakHistory();
  if (!history.includes(today)) {
    history.unshift(today);
  }

  // Check for new badge unlock
  const unlocked = await getUnlockedBadges();
  let newBadge = null;
  const badge = STREAK_BADGES.find(b => b.day === streak.currentStreak);
  if (badge && !unlocked.includes(badge.day)) {
    unlocked.push(badge.day);
    newBadge = badge;
  }

  await Promise.all([
    AsyncStorage.setItem(KEYS.STREAK, JSON.stringify(streak)),
    AsyncStorage.setItem(KEYS.STREAK_HISTORY, JSON.stringify(history.slice(0, 365))),
    AsyncStorage.setItem(KEYS.STREAK_BADGES, JSON.stringify(unlocked)),
  ]);

  // Sync to cloud
  syncStreakToCloud(streak).catch(() => {});
  if (newBadge) syncBadgeToCloud(newBadge.day).catch(() => {});

  return { ...streak, newBadge };
}

// ===== Daily 30 =====

export async function getDailyLastDate(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.DAILY_LAST_DATE);
}

export async function hasCompletedDailyToday(): Promise<boolean> {
  const lastDate = await getDailyLastDate();
  const today = new Date().toISOString().split('T')[0];
  return lastDate === today;
}

export async function saveDailyResult(result: DailyResult): Promise<void> {
  const history = await getDailyHistory();
  history.unshift(result);
  await AsyncStorage.setItem(KEYS.DAILY_HISTORY, JSON.stringify(history.slice(0, 90)));
  await AsyncStorage.setItem(KEYS.DAILY_LAST_DATE, result.date);
  syncDailyResultToCloud(result).catch(() => {});
}

export async function getDailyHistory(): Promise<DailyResult[]> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_HISTORY);
  return raw ? JSON.parse(raw) : [];
}

export async function getBestScoreThisWeek(): Promise<number> {
  const history = await getDailyHistory();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const thisWeek = history.filter(d => d.date >= weekAgo);
  return thisWeek.length > 0 ? Math.max(...thisWeek.map(d => d.score)) : 0;
}

// ===== Duels =====

export async function getDuels(): Promise<Duel[]> {
  const raw = await AsyncStorage.getItem(KEYS.DUELS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveDuel(duel: Duel): Promise<void> {
  const duels = await getDuels();
  const idx = duels.findIndex(d => d.id === duel.id);
  if (idx >= 0) duels[idx] = duel;
  else duels.unshift(duel);
  await AsyncStorage.setItem(KEYS.DUELS, JSON.stringify(duels.slice(0, 50)));
}

export async function getPendingDuels(): Promise<Duel[]> {
  const duels = await getDuels();
  return duels.filter(d => d.status === 'pending');
}

// ===== Feature Interest =====

export async function trackFeatureInterest(feature: ComingSoonFeature): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.FEATURE_INTEREST);
  const interest: Record<string, number> = raw ? JSON.parse(raw) : {};
  interest[feature] = (interest[feature] || 0) + 1;
  await AsyncStorage.setItem(KEYS.FEATURE_INTEREST, JSON.stringify(interest));
}

// ===== Recent Insights =====

export async function getRecentInsights(): Promise<string[]> {
  const sessions = await getSessions();
  const insights: string[] = [];
  for (const s of sessions.slice(0, 5)) {
    const full = await getSessionById(s.id);
    if (full && full.turns.length > 0) {
      const insight = full.turns[full.turns.length - 1].coachingInsight;
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

// ===== Score History =====

export async function getAverageScores(): Promise<{ overall: number; structure: number; concision: number; substance: number; fillerWords: number; sessionCount: number } | null> {
  const sessions = await getSessions();
  if (sessions.length === 0) return null;
  // We need full session data for scores — check last 10
  const recentIds = sessions.slice(0, 10).map(s => s.id);
  let totalOverall = 0, totalStructure = 0, totalConcision = 0, totalSubstance = 0, totalFiller = 0, count = 0;
  for (const id of recentIds) {
    const full = await getSessionById(id);
    if (full && full.turns.length > 0) {
      const lastTurn = full.turns[full.turns.length - 1];
      totalOverall += lastTurn.overall;
      totalStructure += lastTurn.scores.structure;
      totalConcision += lastTurn.scores.concision;
      totalSubstance += lastTurn.scores.substance;
      totalFiller += lastTurn.scores.fillerWords;
      count++;
    }
  }
  if (count === 0) return null;
  return {
    overall: Math.round((totalOverall / count) * 10) / 10,
    structure: Math.round((totalStructure / count) * 10) / 10,
    concision: Math.round((totalConcision / count) * 10) / 10,
    substance: Math.round((totalSubstance / count) * 10) / 10,
    fillerWords: Math.round((totalFiller / count) * 10) / 10,
    sessionCount: sessions.length,
  };
}

// ===== Progress Analytics =====

export interface ProgressData {
  totalSessions: number;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  currentStreak: number;
  longestStreak: number;
  overallTrend: { date: string; score: number }[];
  dimensionAverages: { structure: number; concision: number; substance: number; fillerWords: number; awareness: number };
  dimensionTrends: { dimension: string; first5Avg: number; last5Avg: number; change: number }[];
  bestSession: { score: number; date: string; type: string } | null;
  worstToFirst: string; // dimension with biggest improvement
  fillerTrend: { early: number; recent: number };
  recentInsights: string[];
}

export async function getProgressData(): Promise<ProgressData> {
  const sessions = await getSessions();
  const streak = await getStreak();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

  // Load full session details for score dimensions
  const fullSessions: { scores: any; overall: number; date: string; type: string; insight: string }[] = [];
  for (const s of sessions.slice(0, 30)) {
    const full = await getSessionById(s.id);
    if (full && full.turns.length > 0) {
      const lastTurn = full.turns[full.turns.length - 1];
      fullSessions.push({
        scores: lastTurn.scores,
        overall: lastTurn.overall,
        date: full.createdAt.split('T')[0],
        type: full.type,
        insight: lastTurn.coachingInsight,
      });
    }
  }

  const sessionsThisWeek = sessions.filter(s => s.createdAt.split('T')[0] >= weekAgo).length;
  const sessionsLastWeek = sessions.filter(s => {
    const d = s.createdAt.split('T')[0];
    return d >= twoWeeksAgo && d < weekAgo;
  }).length;

  // Overall score trend (chronological)
  const overallTrend = [...fullSessions].reverse().map(s => ({ date: s.date, score: s.overall }));

  // Dimension averages (all time)
  const dims = { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 };
  let dimCount = 0;
  fullSessions.forEach(s => {
    if (s.scores) {
      dims.structure += s.scores.structure || 0;
      dims.concision += s.scores.concision || 0;
      dims.substance += s.scores.substance || 0;
      dims.fillerWords += s.scores.fillerWords || 0;
      dims.awareness += s.scores.awareness || 0;
      dimCount++;
    }
  });
  const dimensionAverages = dimCount > 0 ? {
    structure: Math.round((dims.structure / dimCount) * 10) / 10,
    concision: Math.round((dims.concision / dimCount) * 10) / 10,
    substance: Math.round((dims.substance / dimCount) * 10) / 10,
    fillerWords: Math.round((dims.fillerWords / dimCount) * 10) / 10,
    awareness: Math.round((dims.awareness / dimCount) * 10) / 10,
  } : { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 };

  // Dimension trends (first 5 vs last 5)
  const first5 = fullSessions.slice(-5);
  const last5 = fullSessions.slice(0, 5);
  const dimNames = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
  const dimensionTrends = dimNames.map(dim => {
    const f5 = first5.length > 0 ? first5.reduce((a, s) => a + (s.scores?.[dim] || 0), 0) / first5.length : 0;
    const l5 = last5.length > 0 ? last5.reduce((a, s) => a + (s.scores?.[dim] || 0), 0) / last5.length : 0;
    return { dimension: dim, first5Avg: Math.round(f5 * 10) / 10, last5Avg: Math.round(l5 * 10) / 10, change: Math.round((l5 - f5) * 10) / 10 };
  });

  // Best session
  const best = fullSessions.length > 0
    ? fullSessions.reduce((a, b) => a.overall > b.overall ? a : b)
    : null;

  // Biggest improvement dimension
  const worstToFirst = dimensionTrends.reduce((a, b) => a.change > b.change ? a : b).dimension;

  // Filler word trend
  const earlyFillers = first5.length > 0 ? first5.reduce((a, s) => a + (s.scores?.fillerWords || 0), 0) / first5.length : 0;
  const recentFillers = last5.length > 0 ? last5.reduce((a, s) => a + (s.scores?.fillerWords || 0), 0) / last5.length : 0;

  return {
    totalSessions: sessions.length,
    sessionsThisWeek,
    sessionsLastWeek,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    overallTrend,
    dimensionAverages,
    dimensionTrends,
    bestSession: best ? { score: best.overall, date: best.date, type: best.type } : null,
    worstToFirst,
    fillerTrend: { early: Math.round(earlyFillers * 10) / 10, recent: Math.round(recentFillers * 10) / 10 },
    recentInsights: fullSessions.slice(0, 3).map(s => s.insight).filter(Boolean),
  };
}

// ===== Active Thread (threaded challenge state) =====

export async function saveActiveThread(thread: ActiveThread): Promise<void> {
  await AsyncStorage.setItem(KEYS.ACTIVE_THREAD, JSON.stringify(thread));
}

export async function getActiveThread(): Promise<ActiveThread | null> {
  const raw = await AsyncStorage.getItem(KEYS.ACTIVE_THREAD);
  return raw ? JSON.parse(raw) : null;
}

export async function clearActiveThread(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.ACTIVE_THREAD);
}

// ===== Recent Session History (for question engine) =====

export async function getRecentSessionHistory(count: number = 10): Promise<{
  question: string;
  format: string;
  transcript: string;
  scores: { structure: number; concision: number; substance: number; fillerWords: number; awareness: number };
  overall: number;
  coachingInsight: string;
  weakestArea: string;
  date: string;
  type: string;
}[]> {
  const sessions = await getSessions();
  const history: any[] = [];
  for (const s of sessions.slice(0, count)) {
    const full = await getSessionById(s.id);
    if (full && full.turns.length > 0) {
      const lastTurn = full.turns[full.turns.length - 1];
      const scores = lastTurn.scores;
      const dims = Object.entries(scores) as [string, number][];
      const weakest = dims.reduce((a, b) => a[1] < b[1] ? a : b);
      history.push({
        question: lastTurn.question,
        format: full.type,
        transcript: lastTurn.transcript.slice(0, 150),
        scores: lastTurn.scores,
        overall: lastTurn.overall,
        coachingInsight: lastTurn.coachingInsight,
        weakestArea: weakest[0],
        date: full.createdAt.split('T')[0],
        type: full.type,
      });
    }
  }
  return history;
}

// ===== Question Caching =====

export async function getCachedDailyQuestion(): Promise<{ date: string; question: any } | null> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_QUESTION_CACHE);
  if (!raw) return null;
  const cached = JSON.parse(raw);
  const today = new Date().toISOString().split('T')[0];
  // Only return if it's today's question and hasn't been completed
  if (cached.date === today) return cached;
  return null;
}

export async function cacheDailyQuestion(question: any): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await AsyncStorage.setItem(KEYS.DAILY_QUESTION_CACHE, JSON.stringify({ date: today, question }));
}

export async function clearDailyQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.DAILY_QUESTION_CACHE);
}

// One Shot / Threaded question cache
export async function getCachedOneShotQuestion(): Promise<any | null> {
  const raw = await AsyncStorage.getItem('sharp:oneshot_question_cache');
  return raw ? JSON.parse(raw) : null;
}

export async function cacheOneShotQuestion(question: any): Promise<void> {
  await AsyncStorage.setItem('sharp:oneshot_question_cache', JSON.stringify(question));
}

export async function clearOneShotQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem('sharp:oneshot_question_cache');
}

export async function getCachedThreadedQuestion(): Promise<any | null> {
  const raw = await AsyncStorage.getItem('sharp:threaded_question_cache');
  return raw ? JSON.parse(raw) : null;
}

export async function cacheThreadedQuestion(question: any): Promise<void> {
  await AsyncStorage.setItem('sharp:threaded_question_cache', JSON.stringify(question));
}

export async function clearThreadedQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem('sharp:threaded_question_cache');
}

export async function getRecentQuestions(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.RECENT_QUESTIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function addRecentQuestion(question: string): Promise<void> {
  const recent = await getRecentQuestions();
  recent.unshift(question);
  await AsyncStorage.setItem(KEYS.RECENT_QUESTIONS, JSON.stringify(recent.slice(0, 20)));
}

// ===== Utility =====

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
