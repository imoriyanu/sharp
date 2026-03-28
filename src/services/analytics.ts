// Analytics — wraps PostHog (or noop if not configured)
// Set EXPO_PUBLIC_POSTHOG_KEY in your environment to enable

let _posthog: any = null;

export async function initAnalytics(): Promise<void> {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  try {
    const { PostHog } = require('posthog-react-native');
    _posthog = new PostHog(key, { host: 'https://app.posthog.com' });
  } catch {
    // PostHog not installed — skip silently
  }
}

export function trackEvent(event: string, properties?: Record<string, any>): void {
  _posthog?.capture(event, properties);
}

export function identifyUser(id: string, traits?: Record<string, any>): void {
  _posthog?.identify(id, traits);
}

export function resetUser(): void {
  _posthog?.reset();
}

// Pre-defined events for consistency
export const Events = {
  APP_OPENED: 'app_opened',
  SESSION_STARTED: 'session_started',
  SESSION_COMPLETED: 'session_completed',
  QUESTION_GENERATED: 'question_generated',
  QUESTION_REGENERATED: 'question_regenerated',
  RECORDING_STARTED: 'recording_started',
  RECORDING_COMPLETED: 'recording_completed',
  PAYWALL_VIEWED: 'paywall_viewed',
  PURCHASE_STARTED: 'purchase_started',
  PURCHASE_COMPLETED: 'purchase_completed',
  CONTEXT_SETUP_COMPLETED: 'context_setup_completed',
  INDUSTRY_QUESTION_VIEWED: 'industry_question_viewed',
  THREADED_STARTED: 'threaded_started',
  THREADED_COMPLETED: 'threaded_completed',
  LINK_OPENED: 'link_opened',
} as const;
