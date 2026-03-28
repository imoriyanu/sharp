import { apiPost } from './api';
import type { ScoringResult, UserContext, GeneratedQuestion, FollowUp, ThreadDebrief } from '../types';

// ===== Progress Score =====
// Contextualises the raw score against the user's own history.
// Rules:
// - Raw score is NEVER changed — it stays honest
// - Progress score reflects trajectory: are you getting better, worse, or stuck?
// - If you're clearly bad, progress score stays bad — no charity
// - If you're improving from your own baseline, that's acknowledged
// - First 3 sessions: no progress score (not enough data)

export interface ProgressContext {
  rawOverall: number;
  historicalAverage: number | null; // null = no history
  sessionCount: number;
  recentScores: number[]; // last 5 overall scores, newest first
}

export interface ProgressScore {
  raw: number;           // The honest Claude score (unchanged)
  progress: number;      // Progress-adjusted score (contextualised)
  delta: number;         // Difference from their average
  trend: 'improving' | 'declining' | 'steady' | 'new';
  message: string;       // Short contextual message
}

export function computeProgressScore(ctx: ProgressContext): ProgressScore {
  const { rawOverall, historicalAverage, sessionCount, recentScores } = ctx;

  // Not enough data — just return raw
  if (sessionCount < 3 || historicalAverage == null || recentScores.length < 2) {
    return {
      raw: rawOverall,
      progress: rawOverall,
      delta: 0,
      trend: 'new',
      message: sessionCount === 0 ? 'First session — welcome' : `Session ${sessionCount + 1} — building your baseline`,
    };
  }

  const delta = Math.round((rawOverall - historicalAverage) * 10) / 10;

  // Calculate trend from recent scores (are they going up or down?)
  const recentAvg = recentScores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(recentScores.length, 3);
  const olderAvg = recentScores.length >= 4
    ? recentScores.slice(2).reduce((a, b) => a + b, 0) / recentScores.slice(2).length
    : historicalAverage;
  const trendDelta = recentAvg - olderAvg;

  let trend: ProgressScore['trend'];
  if (trendDelta > 0.4) trend = 'improving';
  else if (trendDelta < -0.4) trend = 'declining';
  else trend = 'steady';

  // Progress score: blend raw with trajectory
  // - If improving: small boost (max +0.5) to acknowledge momentum
  // - If declining: no penalty beyond the raw score (it's already lower)
  // - If steady: progress = raw
  // - NEVER inflate a bad score to look good — cap the boost
  let progress = rawOverall;
  if (trend === 'improving' && delta >= -1) {
    // They're getting better — acknowledge it, but don't inflate garbage
    const boost = Math.min(0.5, trendDelta * 0.3);
    progress = Math.min(10, Math.round((rawOverall + boost) * 10) / 10);
  }
  // If raw is genuinely poor (< 4), never boost — keep it real
  if (rawOverall < 4) progress = rawOverall;

  // Generate contextual message
  let message: string;
  if (rawOverall >= historicalAverage + 1.5) {
    message = 'Your best range yet';
  } else if (rawOverall >= historicalAverage + 0.5) {
    message = 'Above your average';
  } else if (trend === 'improving' && rawOverall >= historicalAverage - 0.5) {
    message = 'On an upward trend';
  } else if (rawOverall >= historicalAverage - 0.5) {
    message = 'Consistent with your level';
  } else if (rawOverall >= historicalAverage - 1.5) {
    message = 'Below your usual';
  } else {
    message = 'Tough one — review the coaching';
  }

  return {
    raw: rawOverall,
    progress: Math.round(progress * 10) / 10,
    delta,
    trend,
    message,
  };
}

export async function generateQuestion(context: UserContext & {
  sessionHistory?: any[];
  averageScores?: any;
  recentQuestions?: string[];
}): Promise<GeneratedQuestion> {
  return apiPost('/question/generate', context);
}

export async function scoreAnswer(params: {
  roleText: string;
  currentCompany: string;
  situationText: string;
  dreamRoleAndCompany: string;
  documentExtractions?: any[];
  question: string;
  transcript: string;
  previousScores?: { overall: number; structure: number; concision: number; substance: number; fillerWords: number; sessionCount: number };
  recentInsights?: string[];
}): Promise<ScoringResult> {
  return apiPost('/score', params);
}

export async function generateFollowUp(params: {
  roleText: string;
  currentCompany: string;
  situationText: string;
  dreamRoleAndCompany: string;
  originalQuestion: string;
  previousTranscripts: { turn: number; question: string; transcript: string; scores: any }[];
  turnNumber: number;
}): Promise<FollowUp> {
  // Backend prompt expects `turns` not `previousTranscripts`
  const { previousTranscripts, ...rest } = params;
  return apiPost('/threaded/follow-up', { ...rest, turns: previousTranscripts, question: params.originalQuestion, transcript: previousTranscripts[previousTranscripts.length - 1]?.transcript || '' });
}

export async function generateProgressSummary(params: {
  progressData: any;
  roleText: string;
  currentCompany: string;
}): Promise<{ spokenSummary: string; highlights: string[]; focusArea: string; encouragement: string }> {
  return apiPost('/progress/summary', params);
}

export async function generateDebrief(params: {
  roleText: string;
  currentCompany: string;
  situationText: string;
  dreamRoleAndCompany: string;
  turns: { turn: number; question: string; transcript: string; scores: any }[];
}): Promise<ThreadDebrief> {
  return apiPost('/threaded/debrief', params);
}
