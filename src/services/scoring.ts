import { apiPost } from './api';
import type { ScoringResult, UserContext, GeneratedQuestion, FollowUp, ThreadDebrief } from '../types';

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
  return apiPost('/threaded/follow-up', params);
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
