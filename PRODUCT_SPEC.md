# Sharp AI — Product Specification

> **Last updated:** 2026-04-06
> **Version:** 2.2.0
> **Status:** Production

## What Sharp Is

Sharp trains professionals to speak clearly, concisely, and with substance under pressure. Users record spoken answers to AI-generated questions, receive instant scoring on 5 dimensions, and get coaching grounded in 8 communication science frameworks (never cited to users). The app coaches like a mentor who has read everything and quotes nothing.

**Platform:** React Native / Expo (iOS primary, Android supported)
**Backend:** Node.js + Express on Railway
**AI Engine:** Claude Sonnet 4 (coaching/scoring), Groq Whisper (transcription), Kokoro TTS via Together AI (questions/coaching), ElevenLabs (Conversational AI only)
**Database:** Supabase PostgreSQL (RLS-secured)
**Monetization:** RevenueCat (in-app subscriptions)
**Analytics:** PostHog

---

## App Identity

| Field | Value |
|-------|-------|
| App Name | Sharp |
| Slug | sharp-ai |
| Version | 2.0.0 |
| Bundle ID (iOS) | com.sharp.ai |
| Bundle ID (Android) | com.sharp.ai |
| Scheme | sharp |
| UI Mode | Light only (Soft Dawn) |
| Backend URL | https://sharp-production-2d7c.up.railway.app |

---

## Design System — Soft Dawn

Warm cream canvas, terracotta accent, sage green success. All values live in `src/constants/theme.ts`.

**Palette:**
- Background: `#FAF6F0` (cream), `#FFFFFF` (cards), `#F5F0E8` (inputs)
- Text: `#2A1A0A` (primary), `#6A5A4A` (secondary), `#9A8A7A` (tertiary), `#B8A898` (muted)
- Accent: `#C07050` (terracotta), `#FFF5EB` (light bg), `#F0DCC8` (border)
- Success: `#5A9A5A` (sage green)
- Error: `#C05050`
- Score colours: `#2563EB` (9-10), `#3B82F6` (7-8.9), `#5A9A5A` (5-6.9), `#E8A838` (<5)

**Typography:** System font. Weights 400 (body) / 600 (labels) / 700 (buttons) / 900 (headings/scores).

**Border Radius:** 8 (sm), 12 (md), 16 (lg), 22 (xl), 999 (pill).

---

## Navigation Structure

### Tab Bar (3 tabs)
1. **Home** — Main hub, daily challenge, practice modes, context, recent sessions
2. **History** — Searchable archive of all past sessions
3. **Settings** — Profile, preferences, account, subscription

### Stack Routes
```
app/
├── (tabs)/           Home, History, Settings
├── onboarding/       Hook → Name → Sign In → Challenge Intro → Recording → Result → Value Prop → Paywall → Welcome
├── daily/            Challenge → Result
├── one-shot/         Question → Recording → Results → Coaching
├── threaded/         Follow-Up → Debrief
├── duel/             Create → Accept → Waiting → Results
├── context/          Setup → Documents
├── analytics/        Progress dashboard
├── premium/          Paywall & feature showcase
├── session/[id]      Session replay
├── streak/           Badge journey
├── auth/             Sign in modal
└── privacy/          Privacy policy
```

---

## Onboarding Flow (8 screens)

### Screen 1: Hook (`/onboarding`)
- SharpFox mascot with speech bubble
- Value proposition: "Sharp trains you to speak with substance"
- Feature pills with staggered fade-in animations
- CTA: "See how sharp you are"

### Screen 2: Name Entry (`/onboarding/name`)
- Text input (max 30 chars)
- SharpFox with dynamic greeting bubble
- Saves display name to local storage

### Screen 3: Sign In (`/onboarding/signin`)
- Apple Sign In button (iOS)
- Email/password form (sign up or sign in)
- Email verification flow if needed
- "Skip for now" option (bypasses auth)

### Screen 4: Challenge Intro (`/onboarding/challenge-intro`)
- Prepares user for first assessment
- Question preview: "Tell me about yourself — who you are and what you do"
- Shows what will be scored (5 dimensions)
- Reassurance: "No wrong answers — just speak naturally"
- CTA: "I'm ready"

### Screen 5: Recording (`/onboarding/recording`)
- 30-second timer
- Audio waveform animation
- Record/stop controls
- Transcription on completion

### Screen 6: Result (`/onboarding/result`)
- Animated score reveal (ring fills up, numbers count)
- 5-dimension breakdown with progress bars
- Positives, improvements, coaching insight
- Auto-plays coaching via TTS (2.5s delay)

### Screen 7: Value Prop (`/onboarding/value`)
- 4 feature cards with free/pro badges:
  - Daily Challenge (free)
  - Deep Practice (pro)
  - Pressure Training (pro)
  - Sharp Summary (pro)
- Coming soon tease: Duels, Conversations
- CTA: "Unlock Sharp Pro" or "Start with free plan"

### Screen 8: Paywall → Welcome
- RevenueCat paywall modal (skippable)
- Welcome screen with tips card
- Confetti if pro purchased
- CTA: "Let's go!" → main app

---

## Practice Modes

### 1. Daily Challenge (Free — text-only, no scoring for free users)
**Purpose:** Build a daily communication habit with a single question.

**Flow (Pro users):**
1. Home screen shows "Daily Challenge" hero card
2. Tap → universal question loads from server (same for all users, generated once/day)
3. Question displayed as text only (no TTS — cost optimisation)
4. User records a 60-second response
5. Audio transcribed → scored on 5 dimensions
6. Result screen: score ring, coaching insight, communication tip, suggested angles
7. Streak updates automatically

**Flow (Free users):**
1-4. Same as Pro
5. **No transcription, no scoring** — zero API calls
6. Result screen shows "?" score with lock icon + "Upgrade to Pro to see your score" CTA
7. Streak still updates (keeps engagement)

**Question Generation:**
- Universal question generated server-side once per day (`GET /api/daily-question`)
- Cached on server — all users get the same question (enables duels)
- Context-free questions any professional can answer
- Fallback question if API fails

**Key Details:**
- Text-only (no TTS) — saves ElevenLabs/Kokoro costs
- Free users cost $0/day (no API calls)
- Pro users cost ~$0.03/day (transcription + scoring)

### 2. One Shot (Free: 1/day, Pro: 3/day)
**Purpose:** Full 90-second scored session with comprehensive coaching. Free users get 1/day as a conversion hook — they experience full scoring and coaching, then want more.

**Flow:**
1. Home → One Shot card (unlocked for all users, shows remaining count)
2. Question screen: AI-generated question using user's context
3. Difficulty indicator (1-10 dot scale)
4. "New question" button (2 regenerates per question)
5. Record 90-second response
6. Full scoring + coaching result:
   - 5-dimension scores with progress bars
   - What Went Well / To Work On
   - Coaching insight (one tactical takeaway)
   - Model answer (what a 9/10 sounds like — listenable)
   - Communication tip
   - Suggested angles (alternative approaches)
   - Filler words analysis (count + specific fillers)
   - Suggested reading
   - "Why this question" (collapsible)
7. "Practice the Sharper Version" → coaching drill

**Coaching Drill** (`/one-shot/coaching`):
- Isolates weakest snippet from response
- Shows: original (with problems) → sharper rewrite (with explanation)
- User listens to model version → records their own attempt
- Similarity scoring (word overlap vs model)
- Tiered feedback: >80% "Nailed it", 50-80% "Good attempt", <50% "Try again"
- Unlimited retries (no separate practice limit)

### 3. Threaded Challenge (Pro: 2/day)
**Purpose:** 4-turn escalating pressure drill simulating real conversations.

**Flow:**
1. Home → Threaded card (premium gate)
2. Question screen (same as One Shot, mode=threaded)
3. Record first response (90s)
4. No scoring on turns 1-3 — goes directly to follow-up
5. Follow-up screen shows:
   - Chat thread (all previous Q&A in bubbles)
   - Sharp's reaction to last answer
   - Next pressure question
   - Pressure level badge (Probing → Pressing → Pressure)
   - Progress dots (turn N of 4)
6. User records follow-up answer
7. Repeats for turns 2-3
8. After turn 4 → Debrief:
   - Overall thread score (0-10)
   - Trajectory badge (Improving / Held Steady / Declining)
   - 5 threaded dimensions: Communication Clarity, Handling Pressure, Conciseness, Substance, Consistency
   - Turn-by-turn analysis (score changes + notes)
   - Strongest moment (turn # + quote)
   - Weakest snippet (with rewrite)
   - Dodged questions (if any)
   - Full conversation transcript

**Follow-up Intelligence:**
- Reads entire conversation history, not just last answer
- Finds contradictions, unsupported claims, vagueness
- Connects dots across turns
- Probes documents if user claims something but can't articulate
- Escalating pressure: depth → clarity → challenge → perspective → stakes → accountability

### 4. Industry Insight (Pro: 2/day)
**Purpose:** Practice answering questions about real-world news relevant to your role.

**Flow:**
1. Home → Industry card (requires premium + context setup)
2. Question screen with "Industry Briefing" section:
   - News icon + TLDR of current event
   - Real article links (tappable, opens browser)
   - Google search terms
3. Standard One Shot recording + scoring flow

**News Research:**
- Backend runs agentic search: Claude generates 4 search queries
- Google News RSS scraping in parallel
- Deduplication → 20 unique articles
- Claude selects most relevant + generates practice question

### 5. Sharp Duels (Free, Never Paywalled)
**Purpose:** Async 1v1 competition — the viral growth mechanic.

**Flow:**
1. Player 1 completes Daily Challenge → gets share link
2. Player 2 opens link → records same question
3. Both answers scored independently
4. Results screen: side-by-side comparison
   - Winner banner (green/red/tie)
   - Two-column score comparison
   - Both coaching insights shown
   - "Listen to their answer" option
   - Rematch / Share buttons

**Key Details:**
- Uses the same daily question (enables fair comparison)
- Async — no real-time requirement
- Status: pending → completed → expired
- Never paywalled (viral growth loop)

### 6. Live Conversations (Pro: 1/day)
**Purpose:** Full-duplex voice conversations with AI characters in realistic professional scenarios.

**Powered by:** ElevenLabs Conversational AI (separate from Kokoro TTS)

**5 Scenario Types:**
| Scenario | AI Character | What It Tests |
|----------|-------------|---------------|
| Job Interview | Realistic interviewer for user's target role | Clarity, substance, confidence |
| Salary Negotiation | Manager/HR during raise discussion | Persuasion, anchoring, composure |
| Difficult Feedback | Direct report receiving tough feedback | Empathy, directness, structure |
| Stakeholder Pushback | Skeptical stakeholder challenging a decision | Defence, evidence, adaptability |
| Elevator Pitch | Investor/executive, 60 seconds to hook them | Concision, impact, storytelling |

**Flow:**
1. Home → Conversation card (Pro gate)
2. Select scenario → character intro (name, role, context)
3. 5-minute real-time voice conversation via WebSocket
4. AI adapts in real-time based on user responses
5. Debrief with 5 conversational dimensions:
   - Clarity, Persuasiveness, Composure, Substance, Adaptability
6. Turn-by-turn transcript with coaching notes

**Key Details:**
- Uses ElevenLabs ConvAI (not Kokoro) — requires real-time full-duplex voice
- Pre-configured agent with persona, voice, and scenario context
- Signed URL auth flow for secure WebSocket connection
- Transcript fetched from ElevenLabs API after conversation ends
- 1/day limit for Pro users (highest per-session API cost at ~$0.60/session)

---

## Scoring System

### 5 Dimensions (1-10 each)

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Structure | 25% | Clear flow, leads with point, logical progression |
| Concision | 20% | Every word earning its place, no rambling |
| Substance | 30% | Specific examples, real details, not generic fluff |
| Filler Words | 15% | Um, uh, like, basically, sort of (10 = zero fillers) |
| Awareness | 10% | Industry/company knowledge (defaults to 7 when irrelevant) |

### Score Calibration
- 1-3: Poor (stream of consciousness, entirely vague, major rambling)
- 4-5: Below average (messy, shallow, unfocused)
- 6-7: Decent (mostly tight, reasonable structure)
- 8-9: Strong (clear arc, rich specifics, efficient)
- 10: Exceptional (perfectly crafted, not a word wasted)

### Progress Scoring
- < 3 sessions: No adjustment, trend = "new"
- Improving vs average: +0.5 max boost (never inflates bad scores)
- Declining: No penalty beyond raw score
- Never boosts if raw < 4
- Trend calculated from recent 3 vs older average

### Coaching Principles (Invisible to Users)
Grounded in 8 books, never cited:
- **Pyramid Principle**: Lead with conclusion then support. Rule of three.
- **Made to Stick**: Simple beats complex. Unexpected sticks. Stories > abstractions.
- **Radical Candor**: Care personally, challenge directly. Name behavior, state impact.
- **Never Split the Difference**: Tactical empathy. Labelling. Calibrated questions.
- **Crucial Conversations**: Make it safe. Shared meaning. STATE your path.
- **Talk Like TED**: 18-minute rule. Sensory details. Novelty.
- **Nonviolent Communication**: Observations not evaluations. Feelings, needs, requests.
- **Influence**: Reciprocity. Contrast principle. Social proof.

### Anti-Repetition Rules
- Must quote user's exact words (no generic "good effort")
- Cross-references recent coaching insights to avoid repeating
- If recurring weakness: explicitly references pattern
- If user fixed previous issue: celebrates the improvement

---

## Context & Personalisation

### User Context (4 fields)
1. **What you do** — Role, title, responsibilities
2. **Where you are** — Current company, team
3. **What's coming up** — Upcoming situation (interview, presentation, review)
4. **Where you're headed** — Dream role, aspiration, career goal

### Voice Setup
- Interactive voice-guided onboarding (SharpFox asks conversational questions)
- Sharp speaks each question via TTS → user records answer → transcribed and saved
- Fallback to text input if TTS unavailable
- Can redo voice setup anytime

### Extra Notes
- Freeform text field (max 1000 chars)
- For specific requests, things to avoid, context that doesn't fit fields
- Treated as direct instructions in prompt

### Documents (Premium)
Upload PDF, DOCX, TXT, MD (max 10MB). Automatically classified:

| Type | Colour | Examples |
|------|--------|----------|
| Identity | Blue `#4080C0` | CV, resume, LinkedIn profile |
| Aspiration | Purple `#8B7EC8` | Job description, promotion criteria |
| Evidence | Green `#5A9A5A` | Project brief, performance review |
| Preparation | Terracotta `#C07050` | Meeting agenda, talking points |

**Extraction:** Claude parses each document and extracts:
- Key projects, metrics, skills
- Expectations, timeline, role details
- Gaps (claims vs evidence)
- Coaching usage angles (for One Shot, Threaded, rewrites)

Documents directly influence question generation and scoring.

---

## Gamification

### Streak System
- Tracks consecutive days with at least one session
- Streak freezes: 1 available per week, auto-used if missed yesterday
- Weekly freeze reset on Mondays
- Streak history stored as date array

### Badge Milestones (15 badges)

| Day | Badge | Emoji |
|-----|-------|-------|
| 1 | First Step | 🌱 |
| 3 | Building Momentum | 🔥 |
| 5 | Finding Your Voice | 🎯 |
| 7 | One Week Sharp | ⚡ |
| 10 | Double Digits | 💪 |
| 14 | Two Weeks Strong | 🏔️ |
| 21 | Habit Formed | 🧠 |
| 30 | Sharp Speaker | 👑 |
| 45 | Committed | 💎 |
| 60 | Two Months Sharp | 🔱 |
| 90 | Quarter Master | 🏆 |
| 120 | Unstoppable | ⭐ |
| 180 | Half Year Hero | 🌟 |
| 270 | Nine Month Wonder | 🎖️ |
| 365 | Year of Sharp | 🏅 |

### Badge Journey Screen
- Visual timeline of all badges (locked + unlocked)
- Current position highlighted
- Next milestone with days remaining

---

## Premium Model

### Free Tier
- Daily Challenge (text-only question, no scoring — streak still tracks)
- 1 One Shot per day (full scoring + coaching — conversion hook)
- Sharp Duels (async 1v1)
- Streak tracking + badges

### Sharp Pro

| Feature | Free | Pro |
|---------|------|-----|
| Daily Challenge | Question only (no score) | Full scoring + coaching |
| One Shot sessions | 1/day | 3/day |
| Threaded challenges | — | 2/day |
| Industry questions | — | 2/day |
| Live Conversations | — | 1/day |
| Practice Again (coaching drill) | — | Unlimited |
| Question regenerates | — | 1/question |
| Model answers | — | Unlimited |
| Context + documents | — | Full access |
| Sharp Summary (analytics) | — | Full access |
| Streak freeze | — | 1/week |

### Pricing
- **Annual:** £249.99/year (recommended, ~40% savings, £20.83/mo effective)
- **Monthly:** £34.99/month

### Paywall UX
- Headline: "Speak clearly when it counts. Every time."
- Anchor card: "A communication coach charges £150–500 per session. Sharp Pro gives you unlimited AI coaching that quotes your exact words, shows you the fix, and tracks your progress — for less than a coffee a day."
- 8 outcome-focused feature cards (e.g., "Nail your next interview" not "5 One Shots/day")
- Radio button plan selection (Annual/Monthly)
- RevenueCat handles real App Store pricing when configured
- Restore purchases link for existing subscribers
- Legal text re auto-renewal

### Unit Economics

| User Type | Monthly Cost | Revenue (after Apple 30%) | Margin |
|-----------|-------------|--------------------------|--------|
| Free (active daily) | ~$0.065 (1 One Shot) | $0 | — |
| Pro Light (1-2 sessions/day) | ~$8 | $30.80 (monthly) | +74% |
| Pro Regular (3-4 sessions/day) | ~$18 | $30.80 | +42% |
| Pro Power (maxes everything) | ~$37 | $30.80 | -20% |
| **Blended average** | **~$16** | **$25.87** | **+48%** |

---

## Analytics Dashboard (Premium)

### Sharp Summary
- AI-generated 30-second spoken progress review
- Auto-plays on screen load
- Cached per session count (invalidates on new session)
- Includes: highlights, focus area, encouragement

### Stats Grid
- Total sessions, current streak, best score, sessions this week

### Score Trend Chart
- Last 15 sessions as colour-coded bar chart
- X-axis: Oldest → Most recent

### Dimension Breakdown
- 5 dimensions with progress bars
- Last-5 average + change delta (if 5+ sessions)

### Filler Words Trend
- Early vs Recent comparison
- Improvement/decline messaging

### Recent Coaching
- Last 5 coaching insights from all sessions

---

## Audio System

### Text-to-Speech (Kokoro via Together AI)
Self-hosted open-source TTS replaced ElevenLabs for all non-conversation audio. 99.9% cost reduction ($166/mo → $0.15/mo per power user).

**Provider:** Kokoro-82M model via Together AI GPU API ($0.50/M characters)
**Feature flag:** `TTS_PROVIDER` env var — set to `elevenlabs` for instant rollback
**ElevenLabs retained for:** Conversational AI (live voice conversations only)

5 voice modes mapped to Kokoro voices:

| Mode | Voice | Speed | Use Case |
|------|-------|-------|----------|
| Question | af_heart | 1.0 | Reading practice questions — warm, conversational |
| Coaching | af_heart | 0.9 | Feedback and insights — slower, considered |
| Model | af_nicole | 1.05 | Expert sample answers — crisp, authoritative |
| Follow-up | af_nicole | 1.1 | Threaded pressure questions — assertive |
| Briefing | af_bella | 0.95 | Industry/news context — measured, news-anchor |

**Fallback:** Text-only mode if TTS unavailable. On-device Speech API as secondary fallback.
**Server-side cache:** MD5-keyed, 200 entries, 1hr TTL — same text+mode combo only hits TTS provider once.

### Natural Script Builder
- No preamble — questions go straight to the point (saves ~40 chars per call)
- Roleplay/Pressure: "[situation] [question]"
- Briefing: "[background] [question]"
- All other formats: question text only

### Audio Management
- Single player instance (prevents overlaps)
- Generation counter prevents stale callbacks
- Audio cached locally by text+mode hash
- `stopAudio()` called on every navigation
- Audio guard in root layout stops playback on route change

### Recording
- High-quality preset via expo-audio
- Handles microphone permissions with fallback modes
- Validates transcript: minimum 5 words
- Error messages for empty/short responses with tips

---

## Authentication

### Methods
- **Apple Sign In** (iOS only, one-tap)
- **Email/Password** (6+ char password, email verification)

### Provider
Supabase Auth with PostgreSQL-backed session management.

### Flow
1. Sign up → email verification → session created
2. Supabase trigger auto-creates: profiles, streaks, user_context rows
3. On sign-in: RevenueCat user identified, local data migrated to cloud
4. Session persisted in AsyncStorage, auto-refreshed

### Auth Context
- Wraps entire app via `AuthProvider`
- Monitors `onAuthStateChange` events
- Exposes: user, isAuthenticated, isLoading
- Sign-out resets RevenueCat identity

---

## Cloud Sync

### Strategy
Local-first (AsyncStorage is source of truth) with background sync to Supabase.

### What Syncs
- Profile (display name, avatar, premium status)
- Context (role, company, situation, dream role)
- Sessions + all turns (scores, transcripts, coaching)
- Streak (current, longest, freezes)
- Badges (unlocked milestones)
- Daily results (score, insight, date)
- Documents (metadata to DB, files to Supabase Storage)

### Migration
One-time migration on first sign-in: all local data → Supabase.
- Profile, context, streak, badges, daily results synced first
- Then up to 50 full sessions (largest dataset, done last)

### Error Handling
All sync functions log errors in production (console.warn). Failures never block the UI — local data remains intact.

---

## Push Notifications

### Registration
- Requests permission on app load (after auth)
- Stores Expo push token to Supabase profiles table
- Android: Creates 'coaching' channel with vibration

### Engagement Nudges
Runs daily at 8 PM UTC via server-side cron:
- **Streak at risk** (1 day, streak > 3): "Your N-day streak is at risk. 60 seconds to keep it alive."
- **2 days inactive**: "Quick check-in. Your streak is waiting."
- **3+ days inactive**: Claude generates personalised nudge using name, days away, streak, best score

### Pagination
Processes users in batches of 100 to prevent OOM on large user bases.

---

## Database Schema

### Tables

**profiles** — User account data
```
id (UUID PK), display_name, avatar_url, is_premium, onboarding_complete,
push_token, created_at, updated_at
```

**user_context** — Career/goal information
```
user_id (UUID PK), role_text, current_company, situation_text,
dream_role_and_company, updated_at
```

**sessions** — Practice sessions
```
id (TEXT PK), user_id (UUID FK), type, scenario, created_at
INDEX: idx_sessions_user (user_id, created_at DESC)
```

**turns** — Individual responses within a session
```
id (TEXT PK), session_id (TEXT FK cascade), user_id (UUID FK),
turn_number, question, transcript, model_answer,
scores (JSONB), overall (NUMERIC 3,1),
summary, positives, improvements, coaching_insight, communication_tip,
snippet (JSONB), filler_words_found (TEXT[]), filler_count, created_at
```

**streaks** — Habit tracking
```
user_id (UUID PK), current_streak, longest_streak,
last_session_date (DATE), freezes_available, updated_at
```

**badges** — Achievements
```
user_id (UUID FK), badge_day (INT), unlocked_at
PK: (user_id, badge_day)
```

**daily_results** — Daily practice summary
```
id (TEXT PK), user_id (UUID FK), score (NUMERIC 3,1),
insight, practice_date (DATE), created_at
```

**documents** — User-uploaded files
```
id (TEXT PK), user_id (UUID FK), filename, raw_text,
structured_extraction (JSONB), summary, document_type,
document_subtype, storage_path, uploaded_at
INDEX: idx_documents_user (user_id)
```

**usage** — Feature usage tracking
```
user_id (UUID FK), usage_date (DATE), one_shots, threaded,
practice_again, threaded_this_week, week_start (DATE)
PK: (user_id, usage_date)
```

All tables have Row Level Security (RLS) — users can only access their own data.

**Relationships:**
```
auth.users (Supabase managed)
├── profiles (1:1)
├── user_context (1:1)
├── sessions (1:N)
│   └── turns (1:N)
├── streaks (1:1)
├── badges (1:N)
├── daily_results (1:N)
├── documents (1:N)
└── usage (1:N)
```

---

## Backend API Endpoints

| Method | Endpoint | Rate Limit | Purpose |
|--------|----------|------------|---------|
| GET | /api/health | — | Service status (which APIs configured) |
| GET | /api/usage | — | Daily API usage stats + cost estimation |
| POST | /api/question/generate | 10/min | Generate practice question from context |
| POST | /api/score | 10/min | Score transcript on 5 dimensions + coaching |
| POST | /api/threaded/follow-up | 10/min | Generate pressure follow-up question |
| POST | /api/threaded/debrief | 10/min | Analyse completed threaded challenge |
| POST | /api/progress/summary | 5/min | Generate spoken progress summary |
| POST | /api/transcribe | 10/min | Transcribe audio via Groq Whisper |
| GET | /api/tts | 20/min | Kokoro TTS via Together AI (MP3, fallback to ElevenLabs) |
| GET | /api/daily-question | — | Universal daily question (cached per day, one Claude call for all users) |
| POST | /api/document/extract-text | — | Extract text from PDF/DOCX/TXT |
| POST | /api/document/parse | — | Classify + extract structured data from document |
| POST | /api/notifications/register | — | Store push token |
| POST | /api/notifications/engagement-check | — | Daily engagement nudge cron |
| POST | /api/webhooks/revenuecat | — | Purchase event webhook |
| POST | /api/waitlist | — | Store waitlist email |
| GET | /api/waitlist/count | — | Waitlist count |

---

## Key Data Types

```typescript
// Sessions
type SessionType = 'daily_30' | 'one_shot' | 'threaded' | 'duel'
type RecordingState = 'idle' | 'ready' | 'recording' | 'processing' | 'complete'

// Questions
type QuestionFormat = 'roleplay' | 'prompt' | 'briefing' | 'pressure' | 'context' | 'industry'
type QuestionTarget = 'structure' | 'concision' | 'substance' | 'pressure_handling'
                    | 'self_advocacy' | 'technical_clarity' | 'awareness'

// Documents
type DocumentType = 'identity' | 'aspiration' | 'evidence' | 'preparation'

// Premium
type PlanId = 'free' | 'monthly' | 'annual'
```

---

## Animated Components

| Component | Use |
|-----------|-----|
| PulseDot | Breathing dot during recording |
| AudioWaveBars | 24 animated bars for playback/recording |
| SkeletonLoader | Shimmer loading placeholder |
| LoadingScreen | Fox + notepad with bouncing dots |
| FadeIn | Fade + slide-up entrance (configurable delay) |
| ScoreReveal | Animated counter 0 → final score with spring scale |

---

## Quality Assurance

### Coaching Quality Gate
Non-blocking background evaluation of every coaching output:
- **Specificity:** Does it quote user's exact words?
- **Actionability:** Does it tell exactly what to change?
- **Novelty:** Is it fresh and specific to THIS answer?
- **Model Answer Quality:** Does it sound like the user but sharper?
- **Score Calibration:** Do scores match the rubric?

Logs quality score + improvement suggestions without blocking the response.

---

## External Integrations

| Service | Purpose | Monthly Cost (per power user) |
|---------|---------|-------------------------------|
| Supabase | Auth, PostgreSQL database, file storage, RLS | ~$25 (fixed) |
| Railway | Backend hosting (Node.js/Express) | ~$20 (fixed) |
| Anthropic (Claude Sonnet 4) | All AI intelligence (scoring, coaching, questions) | ~$18 |
| Groq (Whisper) | Audio transcription | ~$0.66 |
| Together AI (Kokoro-82M) | Text-to-speech for questions, coaching, model answers | ~$0.15 |
| ElevenLabs | Conversational AI only (live voice conversations) | ~$18 |
| RevenueCat | In-app purchase management | Free tier |
| PostHog | Event analytics + feature flags | Free tier |
| Expo Notifications | Push notifications | Free |
| Google News RSS | Industry question research | Free |

---

## Analytics Events

```
APP_OPENED, ONBOARDING_STARTED, ONBOARDING_COMPLETED
SESSION_STARTED, SESSION_COMPLETED
QUESTION_GENERATED, QUESTION_REGENERATED
RECORDING_STARTED, RECORDING_COMPLETED, RECORDING_FAILED
DAILY_CHALLENGE_STARTED, DAILY_CHALLENGE_COMPLETED
THREADED_STARTED, THREADED_COMPLETED
INDUSTRY_QUESTION_VIEWED
PAYWALL_VIEWED, PURCHASE_STARTED, PURCHASE_COMPLETED
CONTEXT_SETUP_COMPLETED, DOCUMENT_UPLOADED
DUEL_CREATED, DUEL_ACCEPTED
STREAK_UPDATED, BADGE_UNLOCKED, MODEL_ANSWER_LISTENED
```

---

## Permissions

**iOS:**
- Microphone: "Sharp needs microphone access to record and analyse your spoken answers."

**Android:**
- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`

---

## Build Profiles (EAS)

| Profile | Distribution | Notes |
|---------|-------------|-------|
| Development | Internal | Dev client enabled, non-simulator |
| Preview | Internal | Staging build for testers |
| Production | Store | Auto-increment version |

All profiles use the same Supabase, API, analytics, and RevenueCat configurations.

---

## Commands

```bash
# Start app
npx expo start

# Start backend
cd backend && node server.js

# Type check
npx tsc --noEmit

# Build iOS (production)
eas build --platform ios --profile production

# Build Android (production)
eas build --platform android --profile production

# Build preview (internal testing)
eas build --platform ios --profile preview

# Install Expo package
npx expo install <package-name>

# Clear Metro cache
npx expo start --clear
```

---

## File Structure

```
app/                          # Expo Router screens
├── (tabs)/                   # Tab navigator (Home, History, Settings)
├── daily/                    # Daily 30 flow
├── one-shot/                 # One Shot flow (shared recording screen)
├── threaded/                 # Threaded Challenge
├── duel/                     # Sharp Duels
├── context/                  # Context setup + documents
├── analytics/                # Progress dashboard
├── premium/                  # Paywall
├── onboarding/               # 8-screen onboarding
├── auth/                     # Sign in modal
├── session/[id]              # Session detail
├── streak/                   # Badge journey
└── _layout.tsx               # Root Stack layout

src/
├── constants/
│   ├── theme.ts              # ALL colours, typography, spacing, radius
│   └── badges.ts             # 15 streak badge definitions
├── components/
│   └── Animations.tsx        # PulseDot, AudioWaveBars, FadeIn, ScoreReveal, LoadingScreen
├── context/
│   └── AuthContext.tsx        # Auth provider (Supabase session management)
├── types/index.ts            # ALL TypeScript types
└── services/
    ├── api.ts                # HTTP client (apiPost, apiGet, apiUpload, getTtsUrl)
    ├── storage.ts            # AsyncStorage CRUD for all data
    ├── scoring.ts            # generateQuestion, scoreAnswer, generateFollowUp, generateDebrief
    ├── transcription.ts      # Groq/Whisper via backend
    ├── tts.ts                # Kokoro TTS via Together AI + device fallback (5 voice modes)
    ├── auth.ts               # Apple Sign In + email/password
    ├── premium.ts            # RevenueCat integration + usage limits
    ├── sync.ts               # Supabase cloud sync (all data types)
    ├── supabase.ts           # Supabase client (with noop proxy fallback)
    ├── notifications.ts      # Expo push notifications
    ├── revenuecat.ts         # RevenueCat SDK wrapper
    └── analytics.ts          # PostHog event tracking

backend/
├── server.js                 # Express server, 17 API routes
├── prompts/index.js          # All Claude prompts (7 prompt types)
└── .env                      # API keys (never commit)
```

---

## Growth & Conversion Strategy

### Conversion Funnel
```
TikTok/Shorts/Reels views (4M/month)
    ↓ 0.096% view-to-download
~2,700 downloads/month
    ↓ 5% convert to Pro
~135 new Pro subscribers/month
    ↓ accumulate (6% monthly churn)
~1,277 active Pro subs after 12 months
    =
£10,000/month profit
```

### Conversion Hooks
1. **Free One Shot** (1/day) — lets free users experience full scoring + coaching before paying
2. **Daily Challenge "?" score** — free users record but see locked score, creating curiosity gap
3. **Onboarding scored session** — first-time users get one free scored assessment during onboarding
4. **Outcome-focused paywall** — "Nail your next interview" not "5 One Shots/day"
5. **Value anchoring** — "A coach charges £150-500/session. Sharp Pro costs less than a coffee/day."

### Upgrade Touchpoints (9 locations)
1. Home screen: Threaded, Industry, Conversation, Summary, Context cards (all show Pro badge)
2. Daily Challenge result: "See your score — Upgrade to Pro"
3. One Shot after daily limit: "Upgrade for more"
4. One Shot coaching drill (locked for free)
5. Session detail "Practice again" (locked for free)
6. Question regeneration (locked for free)
7. Settings plan section
8. Onboarding value prop screen
9. Onboarding paywall screen

### Content Strategy (4-5 posts/day across 3 platforms)
| Content Type | Purpose |
|-------------|---------|
| Hook clips ("You say 'um' 47 times in interviews") | Top of funnel, virality |
| Before/after rewrites (show Sharp's coaching) | Product demo, conversion |
| "Score my answer" challenges | Engagement, UGC potential |
| Quick communication tips | Authority building |
| Results/testimonials | Social proof |

---

## Environment Variables

### Backend (Railway)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude Sonnet 4 for scoring/coaching |
| `GROQ_API_KEY` | Whisper transcription |
| `TOGETHER_API_KEY` | Kokoro TTS via Together AI |
| `KOKORO_TTS_URL` | Together AI base URL (defaults to https://api.together.ai) |
| `TTS_PROVIDER` | `kokoro` (default) or `elevenlabs` for instant rollback |
| `ELEVENLABS_API_KEY` | Conversational AI + TTS fallback |
| `ELEVENLABS_VOICE_ID` | Voice for ElevenLabs TTS fallback |
| `ELEVENLABS_AGENT_ID` | Conversational AI agent |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase admin key |
| `REVENUECAT_WEBHOOK_SECRET` | Webhook auth |

### Client (EAS / app.config.ts)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Backend URL |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `EXPO_PUBLIC_POSTHOG_KEY` | PostHog analytics |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat SDK key |
