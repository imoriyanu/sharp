import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { PlanId, PremiumPlan, UsageLimits } from '../types';

// ===== DEVELOPMENT FLAG — change this to toggle premium =====
// Set to true to simulate premium, false for free tier
const DEV_PREMIUM_FLAG = true;
// =============================================================

const USAGE_KEY = 'sharp:daily_usage';

export const PLANS: PremiumPlan[] = [
  { id: 'pass_30', name: '30-Day Pass', price: '€19.99', period: 'one-time', perMonth: '€19.99/mo', badge: 'No commitment' },
  { id: 'monthly', name: 'Monthly', price: '€14.99', period: '/month', perMonth: '€14.99/mo' },
  { id: 'annual', name: 'Annual', price: '€119.88', period: '/year', perMonth: '€9.99/mo', savings: 'Save 33%', recommended: true },
  { id: 'three_year', name: '3-Year', price: '€215.64', period: '/3 years', perMonth: '€5.99/mo', savings: 'Save 54%', badge: 'Best value' },
];

export const FREE_LIMITS: UsageLimits = {
  oneShotsPerDay: 1,
  threadedPerDay: 0,
  threadedPerWeek: 1,
  practiceAgainPerDay: 0,
  canAddContext: false,
  canViewSummary: false,
  canPracticeSnippet: false,
};

export const PREMIUM_LIMITS: UsageLimits = {
  oneShotsPerDay: 5,
  threadedPerDay: 5,
  threadedPerWeek: 999,
  practiceAgainPerDay: 10,
  canAddContext: true,
  canViewSummary: true,
  canPracticeSnippet: true,
};

export function isPremium(): boolean {
  return DEV_PREMIUM_FLAG;
}

export function getLimits(): UsageLimits {
  return isPremium() ? PREMIUM_LIMITS : FREE_LIMITS;
}

export function getPlanName(): string {
  return isPremium() ? 'Sharp Pro' : 'Free';
}

// ===== Usage Tracking =====

interface DailyUsage {
  date: string;
  oneShots: number;
  threaded: number;
  practiceAgain: number;
  threadedThisWeek: number;
  weekStart: string;
}

async function getUsage(): Promise<DailyUsage> {
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

  return { date: today, oneShots: 0, threaded: 0, practiceAgain: 0, threadedThisWeek: 0, weekStart };
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

async function saveUsage(usage: DailyUsage): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  // Sync to cloud
  syncUsageToCloud(usage).catch(() => {});
}

async function syncUsageToCloud(usage: DailyUsage): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await supabase.from('usage').upsert({
      user_id: user.id,
      usage_date: usage.date,
      one_shots: usage.oneShots,
      threaded: usage.threaded,
      practice_again: usage.practiceAgain,
      threaded_this_week: usage.threadedThisWeek,
      week_start: usage.weekStart,
    });
  } catch (e) { /* silent fail */ }
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

export async function trackOneShotUsage(): Promise<void> {
  const usage = await getUsage();
  usage.oneShots++;
  await saveUsage(usage);
}

export async function trackThreadedUsage(): Promise<void> {
  const usage = await getUsage();
  usage.threaded++;
  usage.threadedThisWeek++;
  await saveUsage(usage);
}

export async function trackPracticeAgainUsage(): Promise<void> {
  const usage = await getUsage();
  usage.practiceAgain++;
  await saveUsage(usage);
}
