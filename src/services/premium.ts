import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { initRevenueCat, checkEntitlement, isRevenueCatConfigured, addEntitlementListener } from './revenuecat';
import type { PlanId, PremiumPlan, UsageLimits } from '../types';

function localDateStr(date: Date = new Date()): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// ===== Premium State =====
// Production-ready: reads premium status from AsyncStorage (set by purchase flow)
// Falls back to false (free tier) if not set

const PREMIUM_KEY = 'sharp:premium_status';
const USAGE_KEY = 'sharp:daily_usage';

let _premiumCached: boolean | null = null;
let _planIdCached: PlanId | null = null;

export const PLANS: PremiumPlan[] = [
  // Absolute-£ savings framing beats "Save 38%" above the £50 threshold per
  // 2026 pricing-psychology data. "Most Popular" badge over "Best value" , 
  // social-proof effect adds 5-15% to badged-tier selection rate.
  { id: 'annual', name: 'Annual', price: '£149.99', period: '/year', perMonth: '£12.50/mo', savings: 'Save £90', recommended: true, badge: 'Most Popular' },
  { id: 'monthly', name: 'Monthly', price: '£19.99', period: '/month', perMonth: '£19.99/mo' },
];

export const FREE_LIMITS: UsageLimits = {
  oneShotsPerDay: 1,
  oneShotsPerWeek: 3,           // 3/week is the BITING cap. Daily is just a safety
  threadedPerDay: 0,
  threadedPerWeek: 0,
  industryPerDay: 0,
  conversationsPerDay: 0,       // live voice is Pro-only
  regeneratesPerDay: 0,
  canAddContext: false,
  canViewSummary: false,
  canPracticeSnippet: false,
};

export const PREMIUM_LIMITS: UsageLimits = {
  oneShotsPerDay: 3,
  oneShotsPerWeek: 999,         // effectively unlimited weekly for Pro
  threadedPerDay: 2,
  threadedPerWeek: 999,
  industryPerDay: 2,
  conversationsPerDay: 1,       // 1/day. ElevenLabs duplex is expensive per minute
  regeneratesPerDay: 1,
  canAddContext: true,
  canViewSummary: true,
  canPracticeSnippet: true,
};


// Synchronous checks. Use cached values (loaded at app start)
export function isPremium(): boolean {
  return _premiumCached ?? false;
}

export function isMax(): boolean {
  return false;
}

export function getCurrentPlanId(): PlanId {
  return _planIdCached || 'free';
}

// Async check. Reads from storage, updates cache
export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PREMIUM_KEY);
    if (!raw) {
      _premiumCached = false;
      return false;
    }
    const data = JSON.parse(raw);
    // Check expiry
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      _premiumCached = false;
      return false;
    }
    _premiumCached = data.active === true;
    _planIdCached = data.planId || null;
    return _premiumCached;
  } catch {
    _premiumCached = false;
    _planIdCached = null;
    return false;
  }
}

// Call this on app start to hydrate the synchronous cache.
// Note: syncFromRevenueCat is intentionally NOT awaited here. The RC SDK
// can be slow on cold network, and we don't want it to delay first paint.
// Instead we register the entitlement listener so any actual subscription
// change refreshes the cache immediately, and PremiumSync handles foreground
// re-sync as a backup.
export async function initPremium(): Promise<void> {
  // 1. Init RevenueCat SDK
  await initRevenueCat();
  // 2. Read local cache first (fast, synchronous after this)
  await checkPremiumStatus();
  // 3. Register an entitlement listener so a mid-session upgrade/cancellation
  //    refreshes our cache without waiting for the next foreground.
  addEntitlementListener(async (hasPro) => {
    try {
      if (hasPro && !_premiumCached) {
        const { getDetectedPlanId } = await import('./revenuecat');
        const planId = await getDetectedPlanId();
        await setPremiumStatus(planId);
      } else if (!hasPro && _premiumCached) {
        await clearPremiumStatus();
      }
    } catch (e) {
      __DEV__ && console.warn('Entitlement listener handler failed:', e);
    }
  });
}

// Sync premium status from RevenueCat. Call on init and app foreground
export async function syncFromRevenueCat(): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  try {
    const hasPro = await checkEntitlement();
    if (hasPro && !_premiumCached) {
      // RevenueCat says premium but local cache doesn't. Activate
      // Detect plan from entitlement product ID
      const { getDetectedPlanId } = await import('./revenuecat');
      const planId = await getDetectedPlanId();
      await setPremiumStatus(planId);
    } else if (!hasPro && _premiumCached) {
      // Subscription expired/cancelled. Revoke locally
      await clearPremiumStatus();
    }
  } catch (e) {
    // Network error. Trust the local cache, don't revoke
    __DEV__ && console.warn('RevenueCat sync failed, trusting local cache:', e);
  }
}

// Set premium status (called after successful purchase)
export async function setPremiumStatus(planId: PlanId, expiresAt?: string): Promise<void> {
  const data = { active: true, planId, activatedAt: new Date().toISOString(), expiresAt: expiresAt || null };
  await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(data));
  _premiumCached = true;

  // Sync to cloud
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ is_premium: true, premium_plan: planId }).eq('id', user.id);
    }
  } catch {}
}

// Clear premium (for testing or cancellation)
export async function clearPremiumStatus(): Promise<void> {
  await AsyncStorage.removeItem(PREMIUM_KEY);
  _premiumCached = false;
  _planIdCached = null;
}

export function getLimits(): UsageLimits {
  if (isPremium()) return PREMIUM_LIMITS;
  return FREE_LIMITS;
}

export function getPlanName(): string {
  if (isPremium()) return 'Sharp Pro';
  return 'Free';
}

// ===== Usage Tracking =====

// Simple mutex to prevent concurrent read-modify-write races
let _usageLock: Promise<void> = Promise.resolve();
function withUsageLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _usageLock;
  let resolve: () => void;
  _usageLock = new Promise(r => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

interface DailyUsage {
  date: string;
  oneShots: number;
  oneShotsThisWeek: number;    // free tier weekly cap. Bites at 3/week
  threaded: number;
  industry: number;
  conversations: number;       // live voice. Pro-only, 1/day
  regenerates: number;
  threadedThisWeek: number;
  weekStart: string;
}

async function getUsage(): Promise<DailyUsage> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    const today = localDateStr();
    const weekStart = getWeekStart();

    if (raw) {
      const usage: DailyUsage = JSON.parse(raw);
      // Backward-compat: older records may lack new counters.
      if (usage.oneShotsThisWeek == null) usage.oneShotsThisWeek = 0;
      if (usage.conversations == null) usage.conversations = 0;
      if (usage.date === today) {
        // Reset weekly counters if new week
        if (usage.weekStart !== weekStart) {
          usage.threadedThisWeek = 0;
          usage.oneShotsThisWeek = 0;
          usage.weekStart = weekStart;
        }
        return usage;
      }
      // New day but same week: keep weekly counters, reset daily.
      if (usage.weekStart === weekStart) {
        return { ...usage, date: today, oneShots: 0, threaded: 0, industry: 0, conversations: 0, regenerates: 0 };
      }
    }

    return { date: today, oneShots: 0, oneShotsThisWeek: 0, threaded: 0, industry: 0, conversations: 0, regenerates: 0, threadedThisWeek: 0, weekStart };
  } catch {
    const today = localDateStr();
    return { date: today, oneShots: 0, oneShotsThisWeek: 0, threaded: 0, industry: 0, conversations: 0, regenerates: 0, threadedThisWeek: 0, weekStart: getWeekStart() };
  }
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getTime() - daysToMonday * 86400000);
  return localDateStr(monday);
}

async function saveUsage(usage: DailyUsage): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  syncUsageToCloud(usage).catch(e => {
    __DEV__ && console.warn('Sync failed (usage):', e?.message || e);
    // Queue for retry on next foreground so a Supabase outage doesn't let
    // a multi-device user exceed their daily limits.
    enqueueUsageSync(usage).catch(() => {});
  });
}

async function syncUsageToCloud(usage: DailyUsage): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // NOTE: `conversations` column requires a Supabase migration before it
  // syncs to cloud. Local tracking still works without it. Quota enforces
  // client-side. See README for the migration SQL.
  const { error } = await supabase.from('usage').upsert({
    user_id: user.id,
    usage_date: usage.date,
    one_shots: usage.oneShots,
    threaded: usage.threaded,
    threaded_this_week: usage.threadedThisWeek,
    conversations: usage.conversations,
    week_start: usage.weekStart,
  });
  if (error) {
    // If the conversations column doesn't exist yet, retry without it so
    // the rest of the sync still works. Avoids hard-blocking on migration.
    if (/conversations/i.test(error.message || '')) {
      const { error: retryErr } = await supabase.from('usage').upsert({
        user_id: user.id,
        usage_date: usage.date,
        one_shots: usage.oneShots,
        threaded: usage.threaded,
        threaded_this_week: usage.threadedThisWeek,
        week_start: usage.weekStart,
      });
      if (retryErr) throw retryErr;
      return;
    }
    throw error;
  }
}

// ===== Usage sync retry queue =====
// Persists failed usage syncs to AsyncStorage so a transient Supabase outage
// doesn't desync. Flushed via flushPendingUsageSyncs() on app foreground.
// Bounded so a long outage can't blow up storage.

const PENDING_USAGE_KEY = 'sharp:pending_usage_sync';
const PENDING_USAGE_MAX = 50;

async function enqueueUsageSync(usage: DailyUsage): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_USAGE_KEY);
    let queue: DailyUsage[] = raw ? JSON.parse(raw) : [];
    // Dedupe by usage_date. Only the most recent state per day matters.
    queue = queue.filter(u => u.date !== usage.date);
    queue.push(usage);
    if (queue.length > PENDING_USAGE_MAX) queue = queue.slice(queue.length - PENDING_USAGE_MAX);
    await AsyncStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function flushPendingUsageSyncs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_USAGE_KEY);
    if (!raw) return;
    const queue: DailyUsage[] = JSON.parse(raw);
    if (!queue.length) return;
    const stillPending: DailyUsage[] = [];
    for (const usage of queue) {
      try {
        await syncUsageToCloud(usage);
      } catch {
        stillPending.push(usage);
      }
    }
    if (stillPending.length) {
      await AsyncStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(stillPending));
    } else {
      await AsyncStorage.removeItem(PENDING_USAGE_KEY);
    }
  } catch {}
}

export async function canDoOneShot(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  const usage = await getUsage();
  if (isPremium()) {
    // Pro: daily limit only.
    return { allowed: usage.oneShots < limits.oneShotsPerDay, used: usage.oneShots, limit: limits.oneShotsPerDay };
  }
  // Free: weekly cap bites first (3/week), then per-day as a safety.
  if (usage.oneShotsThisWeek >= limits.oneShotsPerWeek) {
    return { allowed: false, used: usage.oneShotsThisWeek, limit: limits.oneShotsPerWeek };
  }
  return { allowed: usage.oneShots < limits.oneShotsPerDay, used: usage.oneShotsThisWeek, limit: limits.oneShotsPerWeek };
}

export async function canDoThreaded(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  const usage = await getUsage();
  if (isPremium()) {
    return { allowed: usage.threaded < limits.threadedPerDay, used: usage.threaded, limit: limits.threadedPerDay };
  }
  // Free: 1 per week
  return { allowed: usage.threadedThisWeek < limits.threadedPerWeek, used: usage.threadedThisWeek, limit: limits.threadedPerWeek };
}

export function trackOneShotUsage(): Promise<void> {
  return withUsageLock(async () => {
    const u = await getUsage();
    u.oneShots++;
    u.oneShotsThisWeek++;
    await saveUsage(u);
  });
}

export function trackThreadedUsage(): Promise<void> {
  return withUsageLock(async () => { const u = await getUsage(); u.threaded++; u.threadedThisWeek++; await saveUsage(u); });
}

export async function canDoIndustry(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  if (limits.industryPerDay === 0) return { allowed: false, used: 0, limit: 0 };
  const usage = await getUsage();
  return { allowed: (usage.industry || 0) < limits.industryPerDay, used: usage.industry || 0, limit: limits.industryPerDay };
}

export function trackIndustryUsage(): Promise<void> {
  return withUsageLock(async () => { const u = await getUsage(); u.industry = (u.industry || 0) + 1; await saveUsage(u); });
}

// Live voice Conversation mode (ElevenLabs duplex). Pro-only because every
// minute is metered. 1 session per day for Pro. Capped to keep margin sane
// at £19.99/mo. Free tier always returns allowed: false (paywall triggers).
export async function canDoConversation(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  if (limits.conversationsPerDay === 0) return { allowed: false, used: 0, limit: 0 };
  const usage = await getUsage();
  return {
    allowed: (usage.conversations || 0) < limits.conversationsPerDay,
    used: usage.conversations || 0,
    limit: limits.conversationsPerDay,
  };
}

export function trackConversationUsage(): Promise<void> {
  return withUsageLock(async () => {
    const u = await getUsage();
    u.conversations = (u.conversations || 0) + 1;
    await saveUsage(u);
  });
}

// Public usage snapshot for Settings / dashboard chips. Returns the today's
// counters + applicable caps so the caller can render "2/3 used" style strings.
// Free: weekly One Shots + Threaded cap (the biting limits). Pro: per-day caps.
// One Shot uses the weekly counter for free (the cap that actually bites);
// Threaded uses weekly for free (weekly cap = 0) and daily for Pro.
export interface UsageDisplay {
  isPremium: boolean;
  oneShots: { used: number; cap: number };
  threaded: { used: number; cap: number };
  industry: { used: number; cap: number };
  conversations: { used: number; cap: number };
}

export async function getUsageDisplay(): Promise<UsageDisplay> {
  const usage = await getUsage();
  const limits = getLimits();
  const pro = isPremium();
  return {
    isPremium: pro,
    oneShots: pro
      ? { used: usage.oneShots, cap: limits.oneShotsPerDay }
      : { used: usage.oneShotsThisWeek, cap: limits.oneShotsPerWeek },
    threaded: pro
      ? { used: usage.threaded, cap: limits.threadedPerDay }
      : { used: usage.threadedThisWeek, cap: limits.threadedPerWeek },
    industry: { used: usage.industry || 0, cap: limits.industryPerDay },
    conversations: { used: usage.conversations || 0, cap: limits.conversationsPerDay },
  };
}

// Regenerate is PER QUESTION. Tracked in-memory, resets on new question load
let _regenCount = 0;

export function resetRegenCount(): void {
  _regenCount = 0;
}

export function canRegenerate(): { allowed: boolean; used: number; limit: number } {
  const limits = getLimits();
  if (limits.regeneratesPerDay === 0) return { allowed: false, used: 0, limit: 0 };
  return { allowed: _regenCount < limits.regeneratesPerDay, used: _regenCount, limit: limits.regeneratesPerDay };
}

export function trackRegenerateUsage(): void {
  _regenCount++;
}
