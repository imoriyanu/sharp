// Error tracking — wraps Sentry (or noop if not configured)
// Set EXPO_PUBLIC_SENTRY_DSN in your environment to enable

let _initialized = false;

export async function initErrorTracking(): Promise<void> {
  if (_initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // No DSN — silently skip

  try {
    const Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
    });
    _initialized = true;
  } catch {
    // Sentry not installed — skip silently
  }
}

export function captureError(error: Error, context?: Record<string, any>): void {
  if (!_initialized) return;
  try {
    const Sentry = require('@sentry/react-native');
    if (context) {
      Sentry.withScope((scope: any) => {
        Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  } catch {}
}

export function setUser(id: string, email?: string): void {
  if (!_initialized) return;
  try {
    const Sentry = require('@sentry/react-native');
    Sentry.setUser({ id, email });
  } catch {}
}
