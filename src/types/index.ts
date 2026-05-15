// ===== Premium / Subscription =====

export type PlanId = 'free' | 'monthly' | 'annual';

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
  oneShotsPerWeek: number;      // free only — caps generosity so the wall bites
  threadedPerDay: number;       // free: 0 (1 per week tracked separately)
  threadedPerWeek: number;      // free only
  industryPerDay: number;
  regeneratesPerDay: number;
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
  notes: string;
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
  learnMore?: { topic: string; searchTerms: string[]; suggestedReading: string; articles?: string[] };
  timerSeconds?: number;
  reasoning: string;
  targets: QuestionTarget;
  difficulty: number;
  contextUsed: string[];
  // Scene-bible fields produced for every question. Used downstream by the
  // threaded follow-up character agent (characterBrief) and the debrief
  // coach (skillsTested). Never quoted by the character; never shown to the
  // user. Optional for backward-compat with old generations.
  characterBrief?: string;
  skillsTested?: string[];
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
  suggestedReading?: { topic: string; searchTerms: string[]; reason: string };
}

// ===== Session Types =====

export type SessionType = 'daily_30' | 'one_shot' | 'threaded' | 'duel' | 'conversation';

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
  positives?: string;
  improvements?: string;
  communicationTip?: string;
  fillerWordsFound?: string[];
  fillerCount?: number;
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
  // Scene-bible coach output. Additive: old saved debriefs render fine
  // without these (the debrief screen conditionally renders each card).
  pattern?: string;              // 1-2 sentence behavioural pattern across turns
  oneThing?: string;             // single actionable takeaway
  characterArcSummary?: string;  // how the character's state moved across the scene
}

export interface FollowUp {
  reaction: string;
  followUp: string;
  targeting: string;
  pressureLevel: 'depth' | 'clarity' | 'challenge' | 'perspective' | 'stakes' | 'accountability';
  // Scene reaction-system fields (additive; optional for backwards compat with
  // pre-redesign API responses). The character's read of the user's last turn
  // on 5 signals + the taxonomy label of the move it just made.
  signalRead?: ReactionSignalRead;
  reactionType?: ReactionType;
}

export interface ReactionSignalRead {
  presence:    'strong' | 'weak';
  specificity: 'strong' | 'weak';
  restraint:   'strong' | 'weak';
  listening:   'strong' | 'weak';
  toneFit:     'strong' | 'weak';
}

export type ReactionType =
  // Pressure
  | 'pushback'
  | 'clarification-request'
  | 'premise-challenge'
  | 'probe'
  | 'silence-as-turn'
  | 'surface-acceptance'
  | 'defensiveness'
  | 'withdrawal'
  // Affirming
  | 'visible-relief'
  | 'voluntary-depth'
  | 'naming-what-landed'
  | 'reciprocal-vulnerability'
  | 'trust-extension'
  // Combinations (default for realistic conversation)
  | 'agreement-plus-complication'
  | 'pushback-as-intimacy'
  | 'acknowledgment-plus-new-pressure';

export interface ReactionTrailEntry {
  reactionType: ReactionType;
  signalRead: ReactionSignalRead;
  pressureLevel?: string;
}

export interface ThreadTurn {
  turnNumber: number;
  question: string;
  transcript: string;
}

export interface ThreadState {
  originalQuestion: string;
  turns: ThreadTurn[];
  startedAt: string;
  // Scene-bible direction for the threaded character. Set at thread start
  // from the question engine output. Passed back to follow-up calls so the
  // character stays consistent + on the intended escalation arc.
  characterBrief?: string;
  skillsTested?: string[];
  // Most recent character turn from the API. Persisted so backgrounding the
  // app on the follow-up screen doesn't lose the next question (nav params
  // are ephemeral; ThreadState is not).
  pendingCharacterTurn?: {
    reaction: string;
    followUp: string;
    pressureLevel: string;
    targeting?: string;
    signalRead?: ReactionSignalRead;
    reactionType?: ReactionType;
  };
  // Trail of reactions the character has fired across the thread. Each entry
  // captures what move was made + the signals the character read. Used so the
  // next follow-up call can escalate rather than repeat, and so the debrief
  // coach can quote the trail back to the user.
  reactionHistory?: ReactionTrailEntry[];
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

// ===== Conversation Practice Types =====

export type ConversationScenario =
  | 'job_interview'
  | 'salary_negotiation'
  | 'difficult_feedback'
  | 'stakeholder_pushback'
  | 'elevator_pitch'
  | 'custom';

export interface ConversationConfig {
  scenario: ConversationScenario;
  customPrompt?: string;
  maxTurns: number; // 4-6
}

export interface ConversationTurn {
  turnNumber: number;
  agentMessage: string;    // What the AI agent said
  userTranscript: string;  // What the user responded
  timestamp: string;
}

export interface ConversationState {
  id: string;
  config: ConversationConfig;
  turns: ConversationTurn[];
  agentPersona: string;    // Agent's name/role
  scenarioDescription: string;
  startedAt: string;
}

export interface ConversationDebrief {
  scores: {
    clarity: number;          // 1-10
    persuasiveness: number;   // 1-10
    composure: number;        // 1-10
    substance: number;        // 1-10
    adaptability: number;     // 1-10
  };
  overall: number;
  trajectory: 'improving' | 'declining' | 'steady';
  summary: string;
  strongestMoment: { turn: number; quote: string; why: string };
  weakestMoment: { turn: number; quote: string; fix: string };
  turnByTurn: { turn: number; note: string; score: number }[];
  coachingInsight: string;
  modelExchange?: string; // How an ideal version of the hardest turn would sound
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
