import type { StreakBadge } from '../types';

export const STREAK_BADGES: StreakBadge[] = [
  // Early momentum (days 1-30)
  { day: 1, name: 'First Step', emoji: '🌱', description: 'Completed your first day' },
  { day: 3, name: 'Building Momentum', emoji: '🔥', description: '3 days in a row' },
  { day: 5, name: 'Finding Your Voice', emoji: '🎯', description: '5 days consistent' },
  { day: 7, name: 'One Week Sharp', emoji: '⚡', description: 'A full week of practice' },
  { day: 10, name: 'Double Digits', emoji: '💪', description: '10 days of commitment' },
  { day: 14, name: 'Two Weeks Strong', emoji: '🏔️', description: 'Halfway to mastery' },
  { day: 21, name: 'Habit Formed', emoji: '🧠', description: 'They say it takes 21 days' },
  { day: 30, name: 'Sharp Speaker', emoji: '👑', description: '30 days. You earned this.' },
  // Long game (days 45-365)
  { day: 45, name: 'Committed', emoji: '💎', description: '45 days — this is who you are now' },
  { day: 60, name: 'Two Months Sharp', emoji: '🔱', description: '60 days of consistent practice' },
  { day: 90, name: 'Quarter Master', emoji: '🏆', description: 'A full quarter. Respect.' },
  { day: 120, name: 'Unstoppable', emoji: '⭐', description: '120 days — most people never get here' },
  { day: 180, name: 'Half Year Hero', emoji: '🌟', description: '6 months. Communication is your superpower.' },
  { day: 270, name: 'Nine Month Wonder', emoji: '🎖️', description: '270 days. You outwork everyone.' },
  { day: 365, name: 'Year of Sharp', emoji: '🏅', description: '365 days. Legendary.' },
];

export function getBadgeForDay(day: number): StreakBadge | undefined {
  return STREAK_BADGES.find(b => b.day === day);
}

export function getNextBadge(currentStreak: number): StreakBadge | undefined {
  return STREAK_BADGES.find(b => b.day > currentStreak);
}

export function getCurrentBadge(currentStreak: number): StreakBadge | undefined {
  return [...STREAK_BADGES].reverse().find(b => b.day <= currentStreak);
}
