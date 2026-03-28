import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { PlanId, PremiumPlan, UsageLimits } from '../types';

// ===== Premium State =====
// Production-ready: reads premium status from AsyncStorage (set by purchase flow)
// Falls back to false (free tier) if not set

const PREMIUM_KEY = 'sharp:premium_status';
const USAGE_KEY = 'sharp:daily_usage';

let _premiumCached: boolean | null = null;
let _planIdCached: PlanId | null = null;

export const PLANS: PremiumPlan[] = [
  { id: 'annual', name: 'Annual', price: '£119.99', period: '/year', perMonth: '£10/mo', savings: 'Save 50%', recommended: true, badge: 'Best value' },
  { id: 'monthly', name: 'Monthly', price: '£20', period: '/month', perMonth: '£20/mo' },
  { id: 'pass_30', name: 'Sprint Pass', price: '£30', period: 'one-time', perMonth: '£30 once', badge: '30 days · No auto-renew' },
];

export const MAX_PLANS: PremiumPlan[] = [
  { id: 'max_annual', name: 'Max Annual', price: '£384', period: '/year', perMonth: '£32/mo', savings: 'Save 20%', recommended: true, badge: 'Best value' },
  { id: 'max_monthly', name: 'Max Monthly', price: '£40', period: '/month', perMonth: '£40/mo' },
];

export const FREE_LIMITS: UsageLimits = {
  oneShotsPerDay: 1,
  threadedPerDay: 0,
  threadedPerWeek: 1,
  practiceAgainPerDay: 0,
  industryPerDay: 0,
  regeneratesPerDay: 0,
  canAddContext: false,
  canViewSummary: false,
  canPracticeSnippet: false,
};

export const PREMIUM_LIMITS: UsageLimits = {
  oneShotsPerDay: 5,
  threadedPerDay: 5,
  threadedPerWeek: 999,
  practiceAgainPerDay: 10,
  industryPerDay: 5,
  regeneratesPerDay: 2,
  canAddContext: true,
  canViewSummary: true,
  canPracticeSnippet: true,
};

export const MAX_LIMITS: UsageLimits = {
  oneShotsPerDay: 20,
  threadedPerDay: 20,
  threadedPerWeek: 999,
  practiceAgainPerDay: 20,
  industryPerDay: 20,
  regeneratesPerDay: 2,
  canAddContext: true,
  canViewSummary: true,
  canPracticeSnippet: true,
};

// Synchronous checks — use cached values (loaded at app start)
export function isPremium(): boolean {
  return _premiumCached ?? false;
}

export function isMax(): boolean {
  return _planIdCached === 'max_monthly' || _planIdCached === 'max_annual';
}

export function getCurrentPlanId(): PlanId {
  return _planIdCached || 'free';
}

// Async check — reads from storage, updates cache
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

// Call this on app start to hydrate the synchronous cache
export async function initPremium(): Promise<void> {
  await checkPremiumStatus();
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
  if (isMax()) return MAX_LIMITS;
  if (isPremium()) return PREMIUM_LIMITS;
  return FREE_LIMITS;
}

export function getPlanName(): string {
  if (isMax()) return 'Sharp Pro Max';
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
  threaded: number;
  industry: number;
  regenerates: number;
  practiceAgain: number;
  threadedThisWeek: number;
  weekStart: string;
}

async function getUsage(): Promise<DailyUsage> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();

    if (raw) {
      const usage: DailyUsage = JSON.parse(raw);
      if (usage.date === today) {
        // Reset weekly counter if new week
        if (usage.weekStart !== weekStart) {
          usage.threadedThisWeek = 0;
          usage.weekStart = weekStart;
        }
        return usage;
      }
    }

    return { date: today, oneShots: 0, threaded: 0, industry: 0, regenerates: 0, practiceAgain: 0, threadedThisWeek: 0, weekStart };
  } catch {
    const today = new Date().toISOString().split('T')[0];
    return { date: today, oneShots: 0, threaded: 0, industry: 0, regenerates: 0, practiceAgain: 0, threadedThisWeek: 0, weekStart: getWeekStart() };
  }
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
}

async function saveUsage(usage: DailyUsage): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  syncUsageToCloud(usage).catch(() => {});
}

async function syncUsageToCloud(usage: DailyUsage): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('usage').upsert({
      user_id: user.id,
      usage_date: usage.date,
      one_shots: usage.oneShots,
      threaded: usage.threaded,
      practice_again: usage.practiceAgain,
      threaded_this_week: usage.threadedThisWeek,
      week_start: usage.weekStart,
    });
  } catch {}
}

export async function canDoOneShot(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  const usage = await getUsage();
  return { allowed: usage.oneShots < limits.oneShotsPerDay, used: usage.oneShots, limit: limits.oneShotsPerDay };
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

export async function canPracticeAgain(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getLimits();
  if (!limits.canPracticeSnippet) return { allowed: false, used: 0, limit: 0 };
  const usage = await getUsage();
  return { allowed: usage.practiceAgain < limits.practiceAgainPerDay, used: usage.practiceAgain, limit: limits.practiceAgainPerDay };
}

export function trackOneShotUsage(): Promise<void> {
  return withUsageLock(async () => { const u = await getUsage(); u.oneShots++; await saveUsage(u); });
}

export function trackThreadedUsage(): Promise<void> {
  return withUsageLock(async () => { const u = await getUsage(); u.threaded++; u.threadedThisWeek++; await saveUsage(u); });
}

export function trackPracticeAgainUsage(): Promise<void> {
  return withUsageLock(async () => { const u = await getUsage(); u.practiceAgain++; await saveUsage(u); });
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

// Regenerate is PER QUESTION — tracked in-memory, resets on new question load
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
