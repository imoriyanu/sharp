import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserContext, UserProfile, Session, SessionSummary, Streak, StreakData, StreakUpdateResult, Duel, DailyResult, ComingSoonFeature, UploadedDocument, ConversationState, SessionForAnalysis, UpcomingEvent } from '../types';
import { STREAK_BADGES } from '../constants/badges';
import { syncProfileToCloud, syncContextToCloud, syncSessionToCloud, syncStreakToCloud, syncBadgeToCloud, syncDailyResultToCloud, migrateLocalToCloud, uploadDocumentToStorage, syncDocumentToCloud, deleteDocumentFromCloud } from './sync';

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

function localDateStr(date: Date = new Date()): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function syncQuietly(fn: Promise<any>, label: string): void {
  fn.catch(e => __DEV__ && console.warn(`Sync failed (${label}):`, e?.message || e));
}

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
  UPCOMING_EVENTS: 'sharp:upcoming_events',
};

// ===== Cloud Migration =====
// One-time migration from local AsyncStorage to Supabase. Safe to call on
// every app launch. Early-returns if already done.
//
// Hardening (vs the original):
// - "in-progress" guard: a parallel call (e.g. from two boot paths) bails
//   instead of running migration twice.
// - Attempt count: after MAX_ATTEMPTS failures, mark as given-up and stop
//   re-running on every cold start. User can manually retry via Settings.
// - Sessions read in parallel via multiGet (much faster on heavy users).
// - migrateLocalToCloud now batches the session upsert into a single
//   round-trip (see sync.ts). All writes are idempotent on primary key.

const MIGRATION_DONE_KEY = 'sharp:cloud_migrated';
const MIGRATION_IN_PROGRESS_KEY = 'sharp:cloud_migration_inprogress';
const MIGRATION_ATTEMPTS_KEY = 'sharp:cloud_migration_attempts';
const MIGRATION_MAX_ATTEMPTS = 3;

export async function runMigrationIfNeeded(): Promise<void> {
  const migrated = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
  if (migrated === 'true' || migrated === 'failed') return;

  // Don't run two migrations concurrently. If another caller is already in
  // flight (rare, but possible during app cold-start race), bail.
  const inProgress = await AsyncStorage.getItem(MIGRATION_IN_PROGRESS_KEY);
  if (inProgress === 'true') return;

  // Give up after MAX_ATTEMPTS so we don't run a known-failing migration on
  // every cold start. Mark as failed; user can retry from Settings.
  const attemptsStr = await AsyncStorage.getItem(MIGRATION_ATTEMPTS_KEY);
  const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  if (attempts >= MIGRATION_MAX_ATTEMPTS) {
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'failed');
    return;
  }

  await AsyncStorage.setItem(MIGRATION_IN_PROGRESS_KEY, 'true');
  await AsyncStorage.setItem(MIGRATION_ATTEMPTS_KEY, String(attempts + 1));

  try {
    // Read all the local data in parallel.
    const [profile, context, streak, unlockedBadges, dailyResults, summaries] = await Promise.all([
      getUserProfile(),
      getContext(),
      getStreak(),
      getUnlockedBadges(),
      getDailyHistory(),
      getSessions(),
    ]);

    // Load up to 50 full sessions via multiGet. Single AsyncStorage round-
    // trip instead of N sequential reads.
    const top = summaries.slice(0, 50);
    const detailKeys = top.map(s => `${KEYS.SESSION_DETAIL}${s.id}`);
    const pairs = await AsyncStorage.multiGet(detailKeys);
    const sessions: any[] = [];
    for (const [, raw] of pairs) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed) sessions.push(parsed);
      } catch {}
    }

    await migrateLocalToCloud({ profile, context, sessions, streak, unlockedBadges, dailyResults });
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
    // Clean up bookkeeping
    await AsyncStorage.multiRemove([MIGRATION_IN_PROGRESS_KEY, MIGRATION_ATTEMPTS_KEY]);
  } catch (e) {
    // Failure: keep attempts counter, clear in-progress flag, leave done
    // flag unset so we'll retry on next launch (up to MAX_ATTEMPTS).
    await AsyncStorage.removeItem(MIGRATION_IN_PROGRESS_KEY);
    __DEV__ && console.warn('Cloud migration failed, will retry next launch:', e);
  }
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

// ===== AI Consent =====
// One-time gate before any user data hits a third-party AI provider.
// v1 suffix lets us re-prompt if disclosure scope changes (new provider).

const AI_CONSENT_KEY = 'sharp:ai_consent_v1';

export async function hasAIConsent(): Promise<boolean> {
  const val = await AsyncStorage.getItem(AI_CONSENT_KEY);
  return val === 'true';
}

export async function setAIConsent(): Promise<void> {
  await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
}

// ===== Account Deletion: full local wipe =====
// Removes every `sharp:*` key written by this app. The session:<id> entries
// have variable suffixes, so we fetch all keys once and filter by prefix.
// Everything else is enumerated explicitly to avoid clobbering keys outside
// our namespace (paranoid: if a future maintainer renames a constant, the
// explicit list will fail loudly rather than miss data silently).

export async function clearAllUserData(): Promise<void> {
  const fixedKeys = [
    KEYS.CONTEXT,
    KEYS.SESSIONS,
    KEYS.DAILY_QUESTION_CACHE,
    KEYS.RECENT_QUESTIONS,
    KEYS.STREAK,
    KEYS.STREAK_HISTORY,
    KEYS.STREAK_BADGES,
    KEYS.DAILY_HISTORY,
    KEYS.DAILY_LAST_DATE,
    KEYS.DUELS,
    KEYS.FEATURE_INTEREST,
    KEYS.USER_PROFILE,
    KEYS.UPCOMING_EVENTS,
    MIGRATION_DONE_KEY,
    MIGRATION_IN_PROGRESS_KEY,
    MIGRATION_ATTEMPTS_KEY,
    AI_CONSENT_KEY,
    'sharp:onboarded',
    'sharp:onboarding_step',
    'sharp:oneshot_question_cache',
    'sharp:threaded_question_cache',
    'sharp:industry_question_cache',
    'sharp:active_conversation',
    'sharp:active_thread',
    'sharp:premium_status',
    'sharp:daily_usage',
    'sharp:pending_usage_sync',
    'sharp:pref_audio',
    'sharp:pref_haptics',
    'sharp:summary_cache',
    'sharp:patterns_cache',
  ];

  // Variable-suffix keys (sharp:session:<id>) need an enumerate + filter pass.
  let dynamicKeys: string[] = [];
  try {
    const all = await AsyncStorage.getAllKeys();
    dynamicKeys = all.filter(k => k.startsWith(KEYS.SESSION_DETAIL));
  } catch {
    // If getAllKeys fails we still wipe the fixed list. Partial is better than none.
  }

  await AsyncStorage.multiRemove([...fixedKeys, ...dynamicKeys]);
}

// ===== User Profile =====

export async function getUserProfile(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  if (!raw) return null;
  const parsed = safeParse<UserProfile | null>(raw, null);
  if (!parsed) return null;
  // Migration: add isPremium if missing from older data
  if (parsed.isPremium === undefined) parsed.isPremium = false;
  return parsed;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
  syncQuietly(syncProfileToCloud(profile), 'profile');
}

// ===== Context =====

export async function getContext(): Promise<UserContext | null> {
  const raw = await AsyncStorage.getItem(KEYS.CONTEXT);
  const ctx = safeParse<UserContext | null>(raw, null);
  if (ctx && ctx.notes === undefined) ctx.notes = '';
  return ctx;
}

export async function saveContext(context: UserContext): Promise<void> {
  await AsyncStorage.setItem(KEYS.CONTEXT, JSON.stringify(context));
  syncQuietly(syncContextToCloud(context), 'context');
}

// ===== Documents =====

export async function addDocument(doc: UploadedDocument, fileUri?: string): Promise<void> {
  const ctx = await getContext() || { roleText: '', currentCompany: '', situationText: '', dreamRoleAndCompany: '', notes: '', documents: [] };
  ctx.documents = [...ctx.documents, doc];
  await AsyncStorage.setItem(KEYS.CONTEXT, JSON.stringify(ctx));
  syncQuietly(syncContextToCloud(ctx), 'context');
  // Upload file to storage + sync metadata to DB in background
  const storagePath = fileUri ? await uploadDocumentToStorage(fileUri, doc.filename) : null;
  syncQuietly(syncDocumentToCloud(doc, storagePath), 'document');
}

export async function removeDocument(docId: string): Promise<void> {
  const ctx = await getContext();
  if (!ctx) return;
  ctx.documents = ctx.documents.filter(d => d.id !== docId);
  await AsyncStorage.setItem(KEYS.CONTEXT, JSON.stringify(ctx));
  syncQuietly(syncContextToCloud(ctx), 'context');
  syncQuietly(deleteDocumentFromCloud(docId), 'document-delete');
}

// ===== Sessions =====

export async function getSessions(): Promise<SessionSummary[]> {
  const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
  return safeParse<SessionSummary[]>(raw, []);
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
  syncQuietly(syncSessionToCloud(session), 'session');
}

export async function updateSessionScore(sessionId: string, overall: number): Promise<void> {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx !== -1) {
    sessions[idx].overall = overall;
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  }
}

export async function getSessionById(id: string): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEYS.SESSION_DETAIL + id);
  return safeParse<Session | null>(raw, null);
}

// ===== Streak =====

export async function getStreak(): Promise<Streak> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK);
  const defaults: Streak = { currentStreak: 0, longestStreak: 0, lastSessionDate: null, freezesUsed: [], freezesAvailable: 1 };
  if (!raw) return defaults;
  const parsed = safeParse<Partial<Streak>>(raw, {});
  return { ...defaults, ...parsed };
}

export async function getStreakHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK_HISTORY);
  return safeParse<string[]>(raw, []);
}

export async function getUnlockedBadges(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(KEYS.STREAK_BADGES);
  return safeParse<number[]>(raw, []);
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
  const today = localDateStr();

  if (streak.lastSessionDate === today) {
    return { ...streak, newBadge: null };
  }

  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  const twoDaysAgo = localDateStr(new Date(Date.now() - 2 * 86400000));

  if (streak.lastSessionDate === yesterday) {
    // Consecutive day. Extend streak
    streak.currentStreak += 1;
  } else if (streak.lastSessionDate === twoDaysAgo && streak.freezesAvailable > 0 && streak.currentStreak > 0) {
    // Missed yesterday but have a freeze. Auto-use it to save the streak
    streak.freezesUsed.push(yesterday);
    streak.freezesAvailable = Math.max(0, streak.freezesAvailable - 1);
    streak.currentStreak += 1; // Continue streak (freeze covered yesterday)
  } else {
    // Streak broken. Reset
    streak.currentStreak = 1;
  }

  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
  streak.lastSessionDate = today;

  // Reset weekly freeze (every Monday)
  const now = new Date();
  if (now.getDay() === 1) { // Monday
    const lastMonday = new Date(now);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const recentFreezes = streak.freezesUsed.filter(d => d > localDateStr(lastMonday));
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
  syncQuietly(syncStreakToCloud(streak), 'streak');
  if (newBadge) syncQuietly(syncBadgeToCloud(newBadge.day), 'badge');

  return { ...streak, newBadge };
}

// ===== Daily 30 =====

export async function getDailyLastDate(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.DAILY_LAST_DATE);
}

export async function hasCompletedDailyToday(): Promise<boolean> {
  const lastDate = await getDailyLastDate();
  const today = localDateStr();
  return lastDate === today;
}

export async function saveDailyResult(result: DailyResult): Promise<void> {
  const history = await getDailyHistory();
  history.unshift(result);
  await AsyncStorage.setItem(KEYS.DAILY_HISTORY, JSON.stringify(history.slice(0, 90)));
  await AsyncStorage.setItem(KEYS.DAILY_LAST_DATE, result.date);
  syncQuietly(syncDailyResultToCloud(result), 'daily');
}

export async function getDailyHistory(): Promise<DailyResult[]> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_HISTORY);
  return safeParse<DailyResult[]>(raw, []);
}

export async function getBestScoreThisWeek(): Promise<number> {
  const history = await getDailyHistory();
  const weekAgo = localDateStr(new Date(Date.now() - 7 * 86400000));
  const thisWeek = history.filter(d => d.date >= weekAgo);
  return thisWeek.length > 0 ? Math.max(...thisWeek.map(d => d.score)) : 0;
}

// ===== Duels =====

export async function getDuels(): Promise<Duel[]> {
  const raw = await AsyncStorage.getItem(KEYS.DUELS);
  return safeParse<Duel[]>(raw, []);
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
  const interest: Record<string, number> = safeParse<Record<string, number>>(raw, {});
  interest[feature] = (interest[feature] || 0) + 1;
  await AsyncStorage.setItem(KEYS.FEATURE_INTEREST, JSON.stringify(interest));
}

// ===== Recent Insights =====

// Batched read of the last N full session blobs in a single AsyncStorage
// round-trip. Replaces sequential getSessionById loops in the helpers below.
async function loadFullSessions(summaries: SessionSummary[], limit: number): Promise<Session[]> {
  const slice = summaries.slice(0, limit);
  if (slice.length === 0) return [];
  const keys = slice.map(s => `${KEYS.SESSION_DETAIL}${s.id}`);
  const pairs = await AsyncStorage.multiGet(keys);
  const out: Session[] = [];
  for (const [, raw] of pairs) {
    if (!raw) continue;
    const parsed = safeParse<Session | null>(raw, null);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function getRecentInsights(): Promise<string[]> {
  const sessions = await getSessions();
  const full = await loadFullSessions(sessions, 5);
  const insights: string[] = [];
  for (const s of full) {
    if (s.turns.length > 0) {
      const insight = s.turns[s.turns.length - 1].coachingInsight;
      if (insight) insights.push(insight);
    }
  }
  return insights;
}

// ===== Score sentinel =====
// A turn with all five dimensions at 0 means scoring was skipped (today: Threaded,
// partially Duels). A real scoring run can never produce all-five-zero. The prompt
// enforces min=1. Skip these turns when computing user-level dimension averages so
// they don't drag dashboards toward zero.
function isUnscored(scores: { structure?: number; concision?: number; substance?: number; fillerWords?: number; awareness?: number } | null | undefined): boolean {
  if (!scores) return true;
  return (
    (scores.structure ?? 0) === 0 &&
    (scores.concision ?? 0) === 0 &&
    (scores.substance ?? 0) === 0 &&
    (scores.fillerWords ?? 0) === 0 &&
    (scores.awareness ?? 0) === 0
  );
}

// ===== Session History for Question Engine =====

export async function getRecentSessionHistory(): Promise<{
  question: string; transcript: string; scores: any; overall: number;
  weakestArea: string; coachingInsight: string; date: string;
}[]> {
  const sessions = await getSessions();
  const full = await loadFullSessions(sessions, 10);
  const history: any[] = [];
  for (const s of full) {
    if (!s.turns.length) continue;
    const last = s.turns[s.turns.length - 1];
    if (isUnscored(last.scores)) continue;
    const dims = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
    const weakest = dims.reduce((a, b) => ((last.scores[a] ?? 0) < (last.scores[b] ?? 0) ? a : b), 'structure' as typeof dims[number]);
    history.push({
      question: last.question.slice(0, 100),
      transcript: last.transcript.slice(0, 150),
      scores: last.scores,
      overall: last.overall,
      weakestArea: weakest,
      coachingInsight: last.coachingInsight || '',
      date: s.createdAt.split('T')[0],
    });
  }
  return history;
}

// ===== Cross-Session Pattern Analysis =====
// Returns the last N scored sessions in the shape the pattern-extraction
// prompt consumes. Skips unscored turns (Threaded zero-sentinel) so they
// don't pollute the input. Trims long transcripts to keep the prompt size
// under control.

export async function getRecentSessionSummariesForAnalysis(limit: number = 15): Promise<SessionForAnalysis[]> {
  const summaries = await getSessions();
  const full = await loadFullSessions(summaries, limit);
  const out: SessionForAnalysis[] = [];
  for (const s of full) {
    if (!s.turns.length) continue;
    const last = s.turns[s.turns.length - 1];
    if (isUnscored(last.scores)) continue;
    out.push({
      type: s.type,
      question: (last.question || '').slice(0, 200),
      transcript: (last.transcript || '').slice(0, 400),
      overall: last.overall,
      scores: {
        structure: last.scores.structure ?? 0,
        concision: last.scores.concision ?? 0,
        substance: last.scores.substance ?? 0,
        fillerWords: last.scores.fillerWords ?? 0,
        awareness: last.scores.awareness ?? 0,
      },
      ...(last.snippet?.original ? { weakestSnippet: { original: last.snippet.original.slice(0, 200), rewrite: (last.snippet.rewrite || '').slice(0, 200) } } : {}),
      ...(last.coachingInsight ? { coachingInsight: last.coachingInsight.slice(0, 200) } : {}),
      date: s.createdAt.split('T')[0],
    });
  }
  return out;
}

// ===== Score History =====

export async function getAverageScores(): Promise<{ overall: number; structure: number; concision: number; substance: number; fillerWords: number; sessionCount: number } | null> {
  const sessions = await getSessions();
  if (sessions.length === 0) return null;
  const full = await loadFullSessions(sessions, 10);
  let totalOverall = 0, totalStructure = 0, totalConcision = 0, totalSubstance = 0, totalFiller = 0, count = 0;
  for (const s of full) {
    if (!s.turns.length) continue;
    const lastTurn = s.turns[s.turns.length - 1];
    if (isUnscored(lastTurn.scores)) continue;
    totalOverall += lastTurn.overall;
    totalStructure += lastTurn.scores.structure;
    totalConcision += lastTurn.scores.concision;
    totalSubstance += lastTurn.scores.substance;
    totalFiller += lastTurn.scores.fillerWords;
    count++;
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
  const weekAgo = localDateStr(new Date(now.getTime() - 7 * 86400000));
  const twoWeeksAgo = localDateStr(new Date(now.getTime() - 14 * 86400000));

  // Load full session details for score dimensions
  const fullSessions: { scores: any; overall: number; date: string; type: string; insight: string }[] = [];
  for (const s of sessions.slice(0, 30)) {
    const full = await getSessionById(s.id);
    if (full && full.turns.length > 0) {
      const lastTurn = full.turns[full.turns.length - 1];
      if (isUnscored(lastTurn.scores)) continue;
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
  const worstToFirst = dimensionTrends.length > 0
    ? dimensionTrends.reduce((a, b) => a.change > b.change ? a : b).dimension
    : 'structure';

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

// ===== Question Caching =====

export async function getCachedDailyQuestion(): Promise<{ date: string; question: any } | null> {
  const raw = await AsyncStorage.getItem(KEYS.DAILY_QUESTION_CACHE);
  if (!raw) return null;
  const cached = safeParse<{ date: string; question: any } | null>(raw, null);
  if (!cached) return null;
  const today = localDateStr();
  if (cached.date === today) return cached;
  return null;
}

export async function cacheDailyQuestion(question: any): Promise<void> {
  const today = localDateStr();
  await AsyncStorage.setItem(KEYS.DAILY_QUESTION_CACHE, JSON.stringify({ date: today, question }));
}

export async function clearDailyQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.DAILY_QUESTION_CACHE);
}

// One Shot / Threaded question cache
export async function getCachedOneShotQuestion(): Promise<any | null> {
  const raw = await AsyncStorage.getItem('sharp:oneshot_question_cache');
  return safeParse(raw, null);
}

export async function cacheOneShotQuestion(question: any): Promise<void> {
  await AsyncStorage.setItem('sharp:oneshot_question_cache', JSON.stringify(question));
}

export async function clearOneShotQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem('sharp:oneshot_question_cache');
}

export async function getCachedThreadedQuestion(): Promise<any | null> {
  const raw = await AsyncStorage.getItem('sharp:threaded_question_cache');
  return safeParse(raw, null);
}

export async function cacheThreadedQuestion(question: any): Promise<void> {
  await AsyncStorage.setItem('sharp:threaded_question_cache', JSON.stringify(question));
}

export async function clearThreadedQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem('sharp:threaded_question_cache');
}

export async function getCachedIndustryQuestion(): Promise<any | null> {
  const raw = await AsyncStorage.getItem('sharp:industry_question_cache');
  return safeParse(raw, null);
}

export async function cacheIndustryQuestion(question: any): Promise<void> {
  await AsyncStorage.setItem('sharp:industry_question_cache', JSON.stringify(question));
}

export async function clearIndustryQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem('sharp:industry_question_cache');
}

export async function getRecentQuestions(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.RECENT_QUESTIONS);
  return safeParse<string[]>(raw, []);
}

export async function addRecentQuestion(question: string): Promise<void> {
  const recent = await getRecentQuestions();
  recent.unshift(question);
  await AsyncStorage.setItem(KEYS.RECENT_QUESTIONS, JSON.stringify(recent.slice(0, 20)));
}

// ===== Conversation State (persisted across screens during a conversation) =====

const CONVERSATION_KEY = 'sharp:active_conversation';

export async function getConversationState(): Promise<ConversationState | null> {
  const raw = await AsyncStorage.getItem(CONVERSATION_KEY);
  return safeParse(raw, null);
}

export async function saveConversationState(state: ConversationState): Promise<void> {
  await AsyncStorage.setItem(CONVERSATION_KEY, JSON.stringify(state));
}

export async function clearConversationState(): Promise<void> {
  await AsyncStorage.removeItem(CONVERSATION_KEY);
}

// ===== Thread State (persisted across screens during a threaded session) =====

const THREAD_KEY = 'sharp:active_thread';

export async function getThreadState(): Promise<import('../types').ThreadState | null> {
  const raw = await AsyncStorage.getItem(THREAD_KEY);
  return safeParse(raw, null);
}

export async function saveThreadState(state: import('../types').ThreadState): Promise<void> {
  await AsyncStorage.setItem(THREAD_KEY, JSON.stringify(state));
}

export async function clearThreadState(): Promise<void> {
  await AsyncStorage.removeItem(THREAD_KEY);
}

export async function clearStaleThread(): Promise<void> {
  const thread = await getThreadState();
  if (!thread) return;
  // Clear if older than 1 hour
  const age = Date.now() - new Date(thread.startedAt).getTime();
  if (age > 60 * 60 * 1000) {
    await clearThreadState();
  }
}

// ===== Storage Cleanup =====

export async function cleanOrphanedSessions(): Promise<void> {
  try {
    const summaries = await getSessions();
    const validIds = new Set(summaries.map(s => s.id));
    const allKeys = await AsyncStorage.getAllKeys();
    const orphanKeys = allKeys.filter(k => k.startsWith(KEYS.SESSION_DETAIL) && !validIds.has(k.replace(KEYS.SESSION_DETAIL, '')));
    if (orphanKeys.length > 0) {
      await AsyncStorage.multiRemove(orphanKeys);
    }
  } catch {}
}

// ===== Upcoming Events ("Coming Up") =====
// User's real-life high-stakes conversations they're preparing for. AsyncStorage
// is the source of truth for v1 (no cloud sync yet. Supabase migration
// pending). All operations are array-based: read full list, mutate, write back.
// Cap 3 active per user enforced at the UI layer but defensively guarded here.
//
// Concurrency: a simple in-process mutex serialises writes so two near-
// simultaneous saves (rapid double-tap) don't clobber each other. Reads
// don't lock. They're idempotent under the auto-mark-passed mutation.

const MAX_ACTIVE_EVENTS = 3;

let _upcomingEventsLock: Promise<void> = Promise.resolve();
function withUpcomingLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _upcomingEventsLock;
  let release: () => void;
  _upcomingEventsLock = new Promise(r => { release = r; });
  return prev.then(fn).finally(() => release!());
}

// Defensive: validates the event has the minimum required shape. Used to
// filter out corrupted entries on read so they can't crash downstream code.
function isValidStoredEvent(e: any): e is UpcomingEvent {
  return !!e
    && typeof e === 'object'
    && typeof e.id === 'string'
    && typeof e.type === 'string'
    && typeof e.title === 'string'
    && typeof e.eventDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate)
    && (e.status === 'active' || e.status === 'passed' || e.status === 'cancelled');
}

export async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEYS.UPCOMING_EVENTS);
  } catch (e) {
    __DEV__ && console.warn('getUpcomingEvents: read failed', e);
    return [];
  }
  const parsed = safeParse<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  // Filter out anything that doesn't look like a valid event. Corrupted
  // entries from a botched write or old schema migration shouldn't leak.
  const list: UpcomingEvent[] = parsed.filter(isValidStoredEvent);

  // Auto-mark expired events as 'passed' so they don't keep counting toward
  // the active cap and the UI shows them in history instead of the hero.
  // Uses ISO date string comparison. Safe because both sides are zero-padded
  // YYYY-MM-DD format (enforced by isValidStoredEvent regex).
  const today = localDateStr();
  let mutated = false;
  for (const e of list) {
    if (e.status === 'active' && e.eventDate < today) {
      e.status = 'passed';
      mutated = true;
    }
  }
  if (mutated) {
    try { await AsyncStorage.setItem(KEYS.UPCOMING_EVENTS, JSON.stringify(list)); }
    catch (e) { __DEV__ && console.warn('getUpcomingEvents: passed-write failed', e); }
  }
  return list;
}

// Returns active events sorted by date ascending (soonest first). The first
// entry is the "primary" event used for the Home hero + scenario context
// injection. Cap-respecting on read so a corrupted cap is self-healing.
export async function getActiveUpcomingEvents(): Promise<UpcomingEvent[]> {
  const all = await getUpcomingEvents();
  return all
    .filter(e => e.status === 'active')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, MAX_ACTIVE_EVENTS);
}

export async function getUpcomingEventById(id: string): Promise<UpcomingEvent | null> {
  const all = await getUpcomingEvents();
  return all.find(e => e.id === id) || null;
}

// Create or update. On create, refuses if active cap is already hit. Returns
// the saved event (with id assigned) or null on cap-hit. Throws on storage
// failure so callers can show a retry UI rather than silently dropping data.
export async function saveUpcomingEvent(event: Partial<UpcomingEvent> & { type: UpcomingEvent['type']; title: string; eventDate: string }): Promise<UpcomingEvent | null> {
  return withUpcomingLock(async () => {
    const all = await getUpcomingEvents();

    // Update path: id already exists
    if (event.id) {
      const idx = all.findIndex(e => e.id === event.id);
      if (idx >= 0) {
        const merged: UpcomingEvent = { ...all[idx], ...event } as UpcomingEvent;
        all[idx] = merged;
        await AsyncStorage.setItem(KEYS.UPCOMING_EVENTS, JSON.stringify(all));
        return merged;
      }
    }

    // Create path
    const activeCount = all.filter(e => e.status === 'active').length;
    if (activeCount >= MAX_ACTIVE_EVENTS) return null;

    const newEvent: UpcomingEvent = {
      id: generateId(),
      type: event.type,
      title: event.title,
      eventDate: event.eventDate,
      description: event.description,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    all.push(newEvent);
    await AsyncStorage.setItem(KEYS.UPCOMING_EVENTS, JSON.stringify(all));
    return newEvent;
  });
}

export async function deleteUpcomingEvent(id: string): Promise<void> {
  return withUpcomingLock(async () => {
    const all = await getUpcomingEvents();
    const next = all.filter(e => e.id !== id);
    try { await AsyncStorage.setItem(KEYS.UPCOMING_EVENTS, JSON.stringify(next)); }
    catch (e) { __DEV__ && console.warn('deleteUpcomingEvent: write failed', e); }
  });
}

export async function markEventPassed(id: string, outcome?: UpcomingEvent['outcome'], outcomeNotes?: string): Promise<void> {
  return withUpcomingLock(async () => {
    const all = await getUpcomingEvents();
    const idx = all.findIndex(e => e.id === id);
    if (idx < 0) return;
    all[idx].status = 'passed';
    if (outcome) all[idx].outcome = outcome;
    if (outcomeNotes) all[idx].outcomeNotes = outcomeNotes;
    try { await AsyncStorage.setItem(KEYS.UPCOMING_EVENTS, JSON.stringify(all)); }
    catch (e) { __DEV__ && console.warn('markEventPassed: write failed', e); }
  });
}

// Days from today until the event date. Negative = past, 0 = today, positive
// = future. Used for countdown rendering on Home + detail screens. Returns 0
// for malformed dates so callers can't crash on a corrupted event.
export function daysUntilEvent(eventDate: string): number {
  if (!eventDate || typeof eventDate !== 'string') return 0;
  // Parse as local-midnight to avoid timezone drift (event 2026-06-01 should
  // always be 2026-06-01 in the user's local time, never shifted by UTC).
  const m = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  const target = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const todayStr = localDateStr();
  const tm = todayStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!tm) return 0;
  const today = new Date(parseInt(tm[1], 10), parseInt(tm[2], 10) - 1, parseInt(tm[3], 10));
  const ms = target.getTime() - today.getTime();
  if (!isFinite(ms)) return 0;
  return Math.round(ms / 86400000);
}

// Composite readiness score for an event: weighted blend of practice volume
// for this event type + recent session avg + recency. Returns 0-10 + a band
// for color coding. Kept client-side for v1. Heuristic, not LLM-generated.
//
// readiness = 0.45 * volumeScore + 0.45 * recentAvg + 0.10 * recencyScore
//   volumeScore = min(sessionsForType / targetVolume, 1) * 10
//   recentAvg   = average overall of last 5 sessions matching the event type
//   recencyScore = 10 if practiced in last 3 days, 5 if 7 days, 0 if >14
export async function getEventReadiness(event: UpcomingEvent): Promise<{ score: number; band: 'red' | 'amber' | 'green'; sessionsForEvent: number }> {
  // For v1, "sessions matching the event type" = all recent sessions (we
  // haven't built session-to-event tagging yet). Once we add that, this
  // function gets a real filter. For now it's a useful proxy.
  const sessions = await getSessions();
  const recent = sessions.slice(0, 30);

  // Volume: practice count over a target appropriate to the event type. We
  // bias the target by urgency. If the event is in 5 days, you want ~5
  // sessions to feel ready. If it's in 30, you can pace yourself.
  const days = Math.max(daysUntilEvent(event.eventDate), 1);
  const targetVolume = Math.min(Math.max(Math.floor(days / 3), 3), 10);
  const volumeScore = Math.min(recent.length / targetVolume, 1) * 10;

  // Recent avg: average of last 5 sessions' overall scores. Excludes
  // unscored sessions (shouldn't be any but defensive).
  const scored = recent.filter(s => s.overall > 0).slice(0, 5);
  const recentAvg = scored.length > 0
    ? scored.reduce((sum, s) => sum + s.overall, 0) / scored.length
    : 0;

  // Recency: when was the last session?
  const lastSession = recent[0];
  let recencyScore = 0;
  if (lastSession) {
    const daysSince = (Date.now() - new Date(lastSession.createdAt).getTime()) / 86400000;
    if (daysSince < 3) recencyScore = 10;
    else if (daysSince < 7) recencyScore = 5;
    else if (daysSince < 14) recencyScore = 2;
  }

  const score = Math.round((0.45 * volumeScore + 0.45 * recentAvg + 0.10 * recencyScore) * 10) / 10;
  const band: 'red' | 'amber' | 'green' = score < 5 ? 'red' : score < 7 ? 'amber' : 'green';
  return { score, band, sessionsForEvent: recent.length };
}

// ===== Utility =====

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
