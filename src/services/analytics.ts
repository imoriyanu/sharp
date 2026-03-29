// Analytics — wraps PostHog (or noop if not configured)
// Set EXPO_PUBLIC_POSTHOG_KEY in your environment or app.config.ts extra to enable

import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

let _posthog: PostHog | null = null;

export async function initAnalytics(): Promise<void> {
  const key = Constants.expoConfig?.extra?.posthogKey || process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  try {
    _posthog = new PostHog(key, {
      host: 'https://eu.i.posthog.com',
      enableSessionReplay: false,
    });
  } catch {
    // PostHog init failed — skip silently
  }
}

export function trackEvent(event: string, properties?: Record<string, any>): void {
  _posthog?.capture(event, properties);
}

export function trackScreen(screenName: string, properties?: Record<string, any>): void {
  _posthog?.screen(screenName, properties);
}

export function identifyUser(id: string, traits?: Record<string, any>): void {
  _posthog?.identify(id, traits);
}

export function resetUser(): void {
  _posthog?.reset();
}

// Pre-defined events for consistency
export const Events = {
  // App lifecycle
  APP_OPENED: 'app_opened',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Sessions
  SESSION_STARTED: 'session_started',
  SESSION_COMPLETED: 'session_completed',

  // Questions
  QUESTION_GENERATED: 'question_generated',
  QUESTION_REGENERATED: 'question_regenerated',

  // Recording
  RECORDING_STARTED: 'recording_started',
  RECORDING_COMPLETED: 'recording_completed',
  RECORDING_FAILED: 'recording_failed',

  // Daily
  DAILY_CHALLENGE_STARTED: 'daily_challenge_started',
  DAILY_CHALLENGE_COMPLETED: 'daily_challenge_completed',

  // Threaded
  THREADED_STARTED: 'threaded_started',
  THREADED_COMPLETED: 'threaded_completed',

  // Industry
  INDUSTRY_QUESTION_VIEWED: 'industry_question_viewed',

  // Premium
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_STARTED: 'purchase_started',
  PURCHASE_COMPLETED: 'purchase_completed',

  // Context
  CONTEXT_SETUP_COMPLETED: 'context_setup_completed',
  DOCUMENT_UPLOADED: 'document_uploaded',

  // Duels
  DUEL_CREATED: 'duel_created',
  DUEL_ACCEPTED: 'duel_accepted',

  // Engagement
  STREAK_UPDATED: 'streak_updated',
  BADGE_UNLOCKED: 'badge_unlocked',
  MODEL_ANSWER_LISTENED: 'model_answer_listened',
} as const;
