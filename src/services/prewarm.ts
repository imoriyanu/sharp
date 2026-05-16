// Sharp AI. App-boot prewarm orchestrator.
//
// Fire-and-forget tasks that make the first user action feel snappier.
// Each task MUST:
//   - return quickly even on cold storage / no network
//   - never throw (swallow errors silently. Failure must not block boot)
//   - do nothing wasteful when the warmup isn't useful right now
//     (e.g. user already completed today's Daily Challenge → skip)
//
// Add a task here ONLY if it pays for itself in perceived latency.
// Keep this file lean. It runs every cold start.

import { getCachedDailyQuestion, hasCompletedDailyToday } from './storage';
import { prefetchAudio, buildNaturalScript, getQuestionVoiceMode } from './tts';

export async function prewarmAtBoot(): Promise<void> {
  // Run warmups in parallel. Each is independently silent on failure.
  await Promise.all([
    warmTodayDailyAudio(),
  ]);
}

// Most common first action: tap Daily 30. If the question is already cached
// (generated on a previous open or by a background job) and the user hasn't
// completed it today, pre-fetch the TTS audio now so the question plays
// instantly when they tap in.
async function warmTodayDailyAudio(): Promise<void> {
  try {
    const done = await hasCompletedDailyToday();
    if (done) return;
    const cached = await getCachedDailyQuestion();
    if (!cached?.question) return;
    prefetchAudio(buildNaturalScript(cached.question), getQuestionVoiceMode(cached.question));
  } catch {
    // Silent. Warmup is best-effort
  }
}
