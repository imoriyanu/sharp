// ===== Premium / Subscription =====

export type PlanId = 'free' | 'pass_30' | 'monthly' | 'annual' | 'three_year';

export interface PremiumPlan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  perMonth: string;
  savings?: string;
  badge?: string;
  recommended?: boolean;
}

export interface UsageLimits {
  oneShotsPerDay: number;
  threadedPerDay: number;       // free: 0 (1 per week tracked separately)
  threadedPerWeek: number;      // free only
  practiceAgainPerDay: number;
  canAddContext: boolean;
  canViewSummary: boolean;
  canPracticeSnippet: boolean;
}

// ===== User Profile =====

export interface UserProfile {
  displayName: string;
  avatarUri?: string;
  isPremium: boolean;
  createdAt: string;
}

// ===== Context Types =====

export interface UserContext {
  roleText: string;
  currentCompany: string;
  situationText: string;
  dreamRoleAndCompany: string;
  documents: UploadedDocument[];
}

export interface UploadedDocument {
  id: string;
  filename: string;
  rawText: string;
  structuredExtraction: DocumentExtraction;
  summary: string;
  documentType: DocumentType;
  documentSubtype: string;
  uploadedAt: string;
}

export type DocumentType = 'identity' | 'aspiration' | 'evidence' | 'preparation';

export interface DocumentExtraction {
  documentType: DocumentType;
  documentSubtype: string;
  summary: string;
  coachingUsage: {
    forOneShot: string;
    forThreaded: string;
    forRewrites: string;
  };
  keyProjects: string[];
  metrics: string[];
  skills: string[];
  expectations: string[];
  timeline: string[];
  roleDetails: string;
  gaps: string[];
}

// ===== Question Engine Types =====

export type QuestionFormat = 'roleplay' | 'prompt' | 'briefing' | 'pressure' | 'context' | 'industry';

export interface GeneratedQuestion {
  format?: QuestionFormat;
  question: string;
  situation?: string;
  background?: string;
  newsContext?: string;
  learnMore?: {
    topic: string;
    searchTerms: string[];
    why: string;
  };
  timerSeconds?: number;
  reasoning: string;
  targets: QuestionTarget;
  difficulty: number;
  contextUsed: string[];
}

export type QuestionTarget =
  | 'structure'
  | 'concision'
  | 'substance'
  | 'pressure_handling'
  | 'self_advocacy'
  | 'technical_clarity'
  | 'awareness';

// ===== Scoring Types =====

export interface SessionScores {
  structure: number;
  concision: number;
  substance: number;
  fillerWords: number;
  awareness: number;
}

export interface WeakestSnippet {
  original: string;
  problems: string[];
  rewrite: string;
  explanation: string;
}

export interface ScoringResult {
  scores: SessionScores;
  overall: number;
  positives: string;
  improvements: string;
  summary: string;
  fillerWordsFound: string[];
  fillerCount: number;
  awarenessNote: string | null;
  weakestSnippet: WeakestSnippet;
  coachingInsight: string;
  communicationTip?: string;
  suggestedAngles?: string[];
  modelAnswer?: string;
  suggestedReading?: {
    topic: string;
    searchTerms: string[];
    why: string;
  };
}

// ===== Session Types =====

export type SessionType = 'daily_30' | 'one_shot' | 'threaded' | 'duel';

export interface Session {
  id: string;
  type: SessionType;
  scenario: string;
  turns: Turn[];
  createdAt: string;
}

export interface Turn {
  id: string;
  turnNumber: number;
  question: string;
  questionReasoning: string;
  questionTargets: QuestionTarget;
  questionDifficulty: number;
  transcript: string;
  recordingUri?: string;
  modelAnswer?: string;
  scores: SessionScores;
  overall: number;
  summary: string;
  coachingInsight: string;
  awarenessNote: string | null;
  snippet: WeakestSnippet;
  followUpTargeting?: string;
}

// ===== Threaded Challenge Types =====

export interface ThreadDebrief {
  threadScores: {
    communicationClarity: number;
    handlingPressure: number;
    conciseness: number;
    substance: number;
    consistency: number;
  };
  overall: number;
  trajectory: 'improving' | 'declining' | 'steady';
  summary: string;
  dodgedQuestions: string[];
  strongestMoment: { turn: number; quote: string };
  weakestSnippet: WeakestSnippet & { turn: number };
  turnByTurn: { turn: number; scoreChange: string | null; note: string }[];
}

export interface FollowUp {
  followUp: string;
  targeting: string;
}

// ===== Daily 30 Types =====

export interface DailyQuestion {
  question: string;
  date: string; // YYYY-MM-DD
}

export interface DailyResult {
  score: number;
  insight: string;
  date: string;
  transcript: string;
}

// ===== Duel Types =====

export type DuelStatus = 'pending' | 'completed' | 'expired';

export interface Duel {
  id: string;
  questionText: string;
  questionDate: string;
  creatorId: string;
  creatorScore: number;
  creatorInsight: string;
  opponentId?: string;
  opponentScore?: number;
  opponentInsight?: string;
  shareToken: string;
  status: DuelStatus;
  creatorAudioConsent: boolean;
  opponentAudioConsent: boolean;
  createdAt: string;
  completedAt?: string;
}

// ===== Streak Types =====

export interface Streak {
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
  freezesUsed: string[];       // dates when freeze was used
  freezesAvailable: number;    // resets weekly for Pro users
}

export interface StreakBadge {
  day: number;
  name: string;
  emoji: string;
  description: string;
}

export interface StreakData extends Streak {
  streakHistory: string[];
  unlockedBadges: number[];
}

export interface StreakUpdateResult extends Streak {
  newBadge: StreakBadge | null;
}

// ===== Session History Types =====

export interface SessionSummary {
  id: string;
  type: SessionType;
  scenario: string;
  overall: number;
  turnCount: number;
  createdAt: string;
  duelOpponent?: string;
  duelResult?: 'win' | 'loss' | 'tie';
}

// ===== Coming Soon Types =====

export type ComingSoonFeature =
  | 'conversation_practice'
  | 'progress_analytics'
  | 'scenario_library'
  | 'answer_library'
  | 'context_timeline'
  | 'document_library'
  | 'pattern_detection'
  | 'shareable_scores'
  | 'sharp_premium'
  | 'sharp_duels'
  | 'per_session_docs';

// ===== API Response Types =====

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ===== Recording State =====

export type RecordingState =
  | 'idle'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'complete';
