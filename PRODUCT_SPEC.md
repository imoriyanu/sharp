# Sharp AI — Complete Product Specification

> **Last updated:** 2026-03-25
> **Version:** 2.1.0 (MVP+)
> **Status:** Working prototype with onboarding, premium system, analytics, and full practice flows

---

## What Sharp Is

Sharp trains people to speak clearly, concisely, and with substance — in every area of life. It's a communication coaching app powered by Claude AI, with real-time voice recording, transcription, 5-dimension scoring, and personalised feedback.

Coaching is invisibly grounded in frameworks from 8 communication science books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence). The app NEVER cites book names — it coaches like a mentor who has read everything and quotes nothing.

**Mascot:** Sharp the Fox — a terracotta fox with glasses, representing cleverness, clarity, and articulation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native 0.81 + Expo SDK 54 (managed workflow) |
| Navigation | Expo Router v6 (file-based) |
| State | AsyncStorage (local-only, no remote DB in MVP) |
| AI Intelligence | Claude Sonnet 4.6 via Anthropic API |
| Transcription | Groq Whisper Large v3 Turbo |
| Text-to-Speech | ElevenLabs (Turbo v2.5) + expo-speech fallback |
| Recording | expo-audio (AudioRecorder) + afconvert/ffmpeg backend re-encode |
| Playback | expo-audio (createAudioPlayer) with disk caching |
| Backend | Node.js + Express on port 3001 |
| Design System | Soft Dawn (warm cream light mode) |

---

## Onboarding Flow (8 Screens)

### Mandatory first-launch experience. Users cannot skip to the main app.

| # | Screen | What Happens | Collects |
|---|--------|-------------|----------|
| 1 | **Welcome** | Fox mascot + speech bubble: "Hey! I'm Sharp — your AI communication coach." Headline: "Communication powers everything." Three feature pills. CTA: "See how sharp you are" | Nothing |
| 2 | **Name** | "What should we call you?" Fox reacts dynamically to input ("Nice to meet you, {name}! 👋"). Progress dots 1/4. | Display name → saved to UserProfile |
| 3 | **Challenge Intro** | Fox listening. "Time to hear you speak!" Challenge card with question, 3 meta items (⏱️ 30s, 🎯 5 dimensions, 💡 AI coaching). "No wrong answers — just speak naturally." | Nothing |
| 4 | **Recording** | 30-second recording. Question: "Tell me about yourself — who you are and what you do?" Wave bars + pulse dot during recording. Retry if < 5 words. | Audio recording → transcription |
| 5 | **Results (Aha Moment)** | Confetti burst + celebrating fox. Animated score reveal. 4 dimension bars. "What you did well" ✅ card. Coaching insight 💡 (auto-spoken). Light improvement suggestion. | Session saved to history |
| 6 | **Value Proposition** | "That was one question. Imagine doing this every day." 4 feature cards (Daily=Free, Deep Practice=Pro, Pressure Training=Pro, Sharp Summary=Pro). CTA: "Unlock Sharp Pro" or "Start free" | Nothing |
| 7 | **Paywall** | Free vs Pro comparison table. Annual (recommended) + Monthly plans only (reduced choice). "Start 7-day free trial" CTA. "Maybe later" skip. | Plan selection (when IAP connected) |
| 8 | **Welcome Home** | Pro: "You're Sharp Pro!" + celebrating fox + confetti. Free: "Welcome, {name}!" + happy fox. Quick tips card. "Let's go" → main app. | `sharp:onboarded = true` |

### Onboarding Scoring
- Uses dedicated `onboardingScoringPrompt` (softer, more encouraging)
- +1 bias to structure, concision, substance (capped at 10)
- Target score range: 5.0-7.0 (nobody scores below 4.0)
- Frames everything as potential: "When you learn to X, you'll Y"
- Awareness defaults to 7 (not relevant for self-introduction)

### Anti-Churn Mechanics
- Sunk cost by screen 5 (they've spoken, been scored, have data)
- Name used throughout app ("Good afternoon, Moriyanu")
- Score creates a gap to close ("You got 5.8 — Pro helps you get to 9")
- Session saved to history (they already have data in the app)
- Free users still get Daily Challenge (hook for return)

---

## Premium System

### Dev Flag
`src/services/premium.ts` line 6: `DEV_PREMIUM_FLAG = true/false` — toggles between premium and free tier.

**Currently set to: `false` (free tier)**

### Plans

| Plan | Price | Per Month | Savings | Notes |
|------|-------|-----------|---------|-------|
| 30-Day Pass | €19.99 one-time | €19.99 | — | No commitment |
| Monthly | €12.99/mo | €12.99 | — | Anchor price |
| Annual (recommended) | €95.88/yr | €7.99 | 38% | Default recommended |
| 3-Year | €215.64/3yr | €5.99 | 54% | Best value, loyalty play |

### Usage Limits

| Feature | Free | Pro |
|---------|------|-----|
| Daily Challenge | Unlimited | Unlimited |
| One Shot | 1/day | 5/day |
| Threaded | 1/week | 5/day |
| Practice Again (snippet) | Locked | 10/day |
| Context & documents | Locked | Yes |
| Sharp Summary & analytics | Locked | Yes |
| Streak freeze | No | 1/week |

### Gating Implementation
- **Home screen:** Context card + Sharp Summary show 🔒 + PRO badge for free users → tap opens paywall
- **Mode cards:** One Shot/Threaded check daily/weekly limits before navigating. Over limit → paywall
- **Results screen:** "Practice the sharper version" shows 🔒 for free, remaining count for pro, greyed at 0
- **Coaching screen:** Practice button locked for free. Shows remaining + greys at limit for pro
- **Session detail:** "Practice again" locked for free. Shows remaining for pro
- **Usage tracked:** Daily counts in AsyncStorage, auto-reset each day. Weekly threaded for free resets Monday

### Paywall Screens
- **Full paywall** (`/premium`): All 4 plans, 7 features comparison, restore purchase, legal text
- **Onboarding paywall** (`/onboarding/paywall`): Simplified — only Annual + Monthly, comparison table, 7-day trial CTA

---

## Fox Mascot — Sharp the Fox

### Visual Design
- Terracotta body (#C07050) with cream belly/face (#F5E6D0)
- Triangular pointed ears with inner ear detail (#E8A070)
- **Glasses** — dark frames (#3A2A1A) with two rounded lenses, bridge connecting them, subtle blue tint
- Dark eyes with white highlight dots (inside glasses)
- Small dark nose, U-shaped smile mouth
- Front paws in darker terracotta (#A05A3A)
- Tail with cream stripe tip

### Animations
- **Gentle bounce** — whole body floats ±3% vertically (2.8s cycle)
- **Tail wag** — oscillates -10° to +15° with pauses (faster when celebrating)
- **Eye blink** — random interval every 3-5 seconds (eyes squish to thin line for 150ms)
- **Celebrating sparkles** — ✨⭐ emojis near head when celebrating

### 4 Expressions
- **happy** — standard smile, both eyes open
- **thinking** — small circle mouth (not smile), both eyes open
- **celebrating** — right eye squints, sparkles appear, faster tail wag
- **listening** — happy smile, attentive posture

### Where Fox Appears
- All 8 onboarding screens (different expressions per screen)
- Loading screen (thinking expression + notepad with animated pencil)
- Welcome/result screens

---

## Scoring System (5 Dimensions, 1-10)

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Structure | 25% | Clear flow, leads with point, logical progression |
| Substance | 30% | Specific examples, metrics, real details vs generic fluff |
| Concision | 20% | Every word earns its place, no rambling |
| Filler Words | 15% | 10 = zero fillers, -1 per 2 fillers detected |
| Awareness | 10% | Industry/context knowledge (defaults to 7 if N/A) |

### Progression-Aware Scoring
- Claude sees average scores from last 10 sessions
- Celebrates improvement: "your structure went from 4.2 to 6.8"
- Only flags regression if 2+ points below average
- Encouraging for beginners (<5 sessions), raises bar for experienced (10+)

### Recurring Pattern Detection
- Last 5 coaching insights passed to Claude with each scoring request
- Calls out recurring weaknesses: "I've mentioned this before — you're still hedging"
- Celebrates fixed patterns: "You did that today — that's real progress"
- Never repeats the exact same insight

### Positive-First Feedback
- Every response includes separate `positives` and `improvements` fields
- Results show green "What went well" ✅ card before neutral "To work on" 🎯 card
- Auto-spoken feedback leads with praise
- Even a 3/10 answer gets genuine positive feedback

### Empty/Short Response Handling
- < 5 words → retry screen with tips, no API credits wasted
- Shows what was heard (if anything)
- Tips: "Speak for 15-20 seconds", "Start with your main point", "Use specific examples"
- "Try again" button restarts recording

---

## Practice Modes

### 1. Daily Challenge (Fully Working)

- **Timer:** Dynamic 45-120 seconds (set by AI based on complexity)
- **5 question formats** with natural mix:
  - **Prompt** (~30%): Simple, direct. 45-60s.
  - **Context** (~25%): About your actual life/work. 60-90s.
  - **Roleplay** (~25%): Vivid scenes with names, stakes. 90-120s.
  - **Briefing** (~10%): Background facts → act on them. 60-90s.
  - **Pressure** (~10%): Tense moments, high stakes. 60-90s.
- **Rich scenarios:** Every roleplay/briefing includes specific names, events, dialogue, stakes
- **Natural TTS:** Greeting + contextual transition + question (ElevenLabs with device fallback)
- **Audio caching:** Question audio cached to disk. TTS replay costs zero API calls.
- **Question caching:** Today's question cached by date in AsyncStorage. Re-opening loads instantly.
- **Recent tracking:** Last 20 questions stored. Claude avoids repeating themes/categories.

### 2. One Shot (Fully Working)

- **Same question engine** as Daily Challenge
- **Full results dashboard** with animated score reveal, staggered fade-ins
- **Model Answer** — complete 9/10 answer built FROM their response, spoken via TTS
- **Snippet Coaching** — listen to model → record version → similarity feedback → retry
- **Practice gated by premium** — free users see paywall, pro users see remaining count

### 3. Threaded Challenge (Partially Working)

- **4 turns** of escalating pressure with follow-ups referencing user's words
- Turn 1: Initial → Turn 2: Probing → Turn 3: Pressing → Turn 4: Pressure
- **Debrief:** UI complete with placeholder data

### 4. Sharp Duels (Coming Soon — UI Complete)

- Coming Soon modal with feature list + "Notify me" button
- Screens built: Create, Accept, Waiting, Results (data stubbed)

---

## Sharp Summary & Progress Analytics (Fully Working)

### Sharp Summary (30-second spoken review)
- Claude analyses all session data and generates a natural, spoken progress summary
- Auto-plays on opening analytics screen
- References specific numbers: "your substance went from 4.0 to 5.8"
- Ends with ONE specific focus area
- Requires 2+ sessions (empty state below threshold)
- **Locked for free users** — PRO badge, taps to paywall

### Analytics Screen
- **Key stats grid:** Total sessions, streak, best score, sessions this week
- **Score trend chart:** Bar chart of last 15 scores, color-coded
- **Dimension breakdown:** 5 dimensions with bars, averages, change arrows (↑↓)
- **Focus area:** AI-recommended dimension
- **Highlights:** 3-4 bullet-point achievements
- **Filler word trend:** Early vs recent comparison
- **Recent coaching insights:** Last 3 insights

---

## Streak & Badges System (Fully Working)

### 15 Badge Milestones (up to 365 days)

| Day | Badge | Emoji | Description |
|-----|-------|-------|-------------|
| 1 | First Step | 🌱 | Completed your first day |
| 3 | Building Momentum | 🔥 | 3 days in a row |
| 5 | Finding Your Voice | 🎯 | 5 days consistent |
| 7 | One Week Sharp | ⚡ | A full week of practice |
| 10 | Double Digits | 💪 | 10 days of commitment |
| 14 | Two Weeks Strong | 🏔️ | Halfway to mastery |
| 21 | Habit Formed | 🧠 | They say it takes 21 days |
| 30 | Sharp Speaker | 👑 | 30 days. You earned this. |
| 45 | Committed | 💎 | This is who you are now |
| 60 | Two Months Sharp | 🔱 | 60 days of consistent practice |
| 90 | Quarter Master | 🏆 | A full quarter. Respect. |
| 120 | Unstoppable | ⭐ | Most people never get here |
| 180 | Half Year Hero | 🌟 | Communication is your superpower |
| 270 | Nine Month Wonder | 🎖️ | You outwork everyone |
| 365 | Year of Sharp | 🏅 | Legendary |

### Streak Freeze (Anti-Churn)
- 1 free freeze per week (resets Monday)
- Auto-activates if you miss a day — streak preserved
- Frozen days show ❄️ in journey grid
- Visible in streak screen stats row

### Streak Screen
- Hero card: current streak + badge + stats (best/badges earned/freeze status)
- Freeze info card
- Next badge teaser with progress bar
- Dynamic journey grid (extends based on streak)
- Two sections: "First 30 Days" and "The Long Game"

---

## User Profile & Context

### Profile (Settings)
- Display name (editable inline)
- Avatar (pick from device photo library)
- Plan status: Free or Sharp Pro with PRO badge
- Home screen greeting: "Good afternoon" (line 1) + "Moriyanu" (line 2, large)

### Context Setup (Premium Only)
- 4 fields with emoji icons: Role 👤, Company 🏢, Situation 🎯, Dream role ✨
- Progress indicator (N/4 fields)
- Document list with type classification chips
- File picker for PDF/DOCX/TXT/MD
- **Locked for free users** — shows 🔒, taps to paywall

---

## Audio System

### Recording (expo-audio)
- `AudioModule.AudioRecorder` with `RecordingPresets.HIGH_QUALITY`
- Outputs M4A on iOS (with problematic `chnl` box)
- Base64 encoded and sent to backend
- Backend pipeline: `afconvert` M4A → WAV (macOS native) → `ffmpeg` WAV → MP3 (16kHz, mono, 64kbps)
- Groq transcribes the clean MP3

### Playback (expo-audio + ElevenLabs)
- `createAudioPlayer` for ElevenLabs MP3 playback
- Audio cached to disk by text hash — replay costs zero
- Device speech (expo-speech) as automatic fallback
- Natural script builder: greetings + transitions based on question format

### State Management
- Generation-based cancellation (`playbackGeneration` counter)
- Global `AudioGuard` in root layout — stops all audio on every route change
- `mountedRef` in every practice screen — prevents state updates after unmount
- No audio can leak between screens

---

## Animations & Components

### Fox Mascot (`src/components/Illustrations.tsx`)
- `SharpFox` — full-body animated fox with glasses, blinking, tail wag
- `SpeechBubble` — two variants (default white, accent terracotta)
- `ProgressDots` — active/current/inactive with elongated active dot
- `ConfettiBurst` — 20 particles in brand colors, staggered spring launch
- `FeatureCard` — slide-in card with emoji + title + chip + description

### Animation Components (`src/components/Animations.tsx`)
- `LoadingScreen` — Fox (thinking) + notepad with animated pencil + bouncing dots
- `AudioWaveBars` — 24-bar wave visualiser for recording/playback
- `PulseDot` — breathing red dot for recording indicator
- `FadeIn` — slide-up fade with staggered delays
- `ScoreReveal` — animated score counter with spring bounce
- `SkeletonLoader` — shimmer placeholder

---

## Backend API (9 Endpoints)

| Endpoint | Method | Purpose | Model | Tokens |
|----------|--------|---------|-------|--------|
| `/api/health` | GET | Health check | — | — |
| `/api/question/generate` | POST | Generate practice question | Claude | 800 |
| `/api/score` | POST | Score + feedback + model answer | Claude | 1500 |
| `/api/score` (isOnboarding) | POST | Soft scoring for first-time users | Claude | 1500 |
| `/api/threaded/follow-up` | POST | Generate follow-up question | Claude | 400 |
| `/api/threaded/debrief` | POST | Thread-level analysis | Claude | 2000 |
| `/api/progress/summary` | POST | AI progress summary | Claude | 600 |
| `/api/transcribe` | POST | Base64 audio → afconvert → ffmpeg → Groq | Groq | — |
| `/api/tts` | GET | Text → ElevenLabs audio stream | ElevenLabs | — |
| `/api/document/parse` | POST | Document classification (stubbed) | Claude | 1000 |

---

## What's Fully Working

- ✅ 8-screen onboarding with fox mascot, recording challenge, paywall
- ✅ Daily Challenge (5 formats, dynamic timing, caching, TTS, streak)
- ✅ One Shot (question → record → score → model answer → coaching)
- ✅ Threaded (turns 1-3 with follow-ups, recording, scoring)
- ✅ 5-dimension scoring with progression awareness + recurring patterns
- ✅ Positive-first feedback (positives → improvements → insight)
- ✅ Model answers (built from user's response, spoken via TTS)
- ✅ Snippet coaching with practice recording + similarity feedback
- ✅ ElevenLabs TTS with caching + device fallback + natural script builder
- ✅ Groq Whisper transcription via base64 + afconvert + ffmpeg
- ✅ Streak system with 15 badges (up to 365 days) + streak freeze
- ✅ Sharp Summary (30-second AI-spoken progress review)
- ✅ Progress analytics (score trends, dimension breakdown, filler tracking)
- ✅ Premium system (4 plans, usage tracking, feature gating, paywall)
- ✅ Session history with full detail view + audio playback
- ✅ User profile (name, avatar, plan status)
- ✅ Context setup with progress indicator (premium only)
- ✅ Professional animations (fox loading, wave bars, fade-ins, score reveal)
- ✅ Audio state management (generation-based, mounted refs, global guard)
- ✅ Empty/short response handling (retry screen with tips)
- ✅ Question variety (12+ categories, 5 formats, recent tracking, context-aware)
- ✅ Responsive UI (wp/fp scaling to all screen sizes)
- ✅ Fox mascot with glasses, blinking, tail wag, 4 expressions

## What's Stubbed / Coming Soon

- ⚠️ Threaded debrief (UI done, placeholder data)
- ⚠️ Document upload parsing (picker works, API not connected)
- ⚠️ Settings preferences (toggles don't persist)
- ⚠️ Session export
- ⚠️ In-app purchases (paywall UI complete, no payment processing — uses dev flag)
- 🔜 Sharp Duels (UI complete, coming soon modal, not integrated)
- 🔜 Conversation Practice (real-time voice AI)
- 🔜 User authentication + cloud sync (see ARCHITECTURE_PLAN.md)
- 🔜 Push notifications for daily reminders
- 🔜 RevenueCat integration for real subscriptions

---

## File Structure

```
sharp-v2/
├── app/
│   ├── (tabs)/             # Tab navigator
│   │   ├── index.tsx       # Home (greeting, streak, modes, context)
│   │   ├── history.tsx     # Session list with type icons
│   │   ├── settings.tsx    # Profile, plan, preferences
│   │   └── _layout.tsx     # Tab bar config
│   ├── onboarding/         # 8-screen onboarding flow
│   │   ├── index.tsx       # Welcome (fox + speech bubble)
│   │   ├── name.tsx        # Name entry (fox reacts)
│   │   ├── challenge-intro.tsx # Challenge setup (fox listening)
│   │   ├── recording.tsx   # 30s recording (wave bars)
│   │   ├── result.tsx      # Score reveal (confetti + fox celebrating)
│   │   ├── value.tsx       # Feature cards (pro/free)
│   │   ├── paywall.tsx     # Plan selection (annual + monthly)
│   │   └── welcome.tsx     # Welcome home (fox happy/celebrating)
│   ├── daily/              # Daily Challenge
│   │   ├── challenge.tsx   # Question + recording + dynamic timer
│   │   └── result.tsx      # Score + feedback + badge unlock
│   ├── one-shot/           # One Shot + Threaded
│   │   ├── question.tsx    # Question display + TTS + difficulty
│   │   ├── recording.tsx   # Timer + wave bars + retry handling
│   │   ├── results.tsx     # Score + model answer + coaching CTA
│   │   └── coaching.tsx    # Snippet practice with recording
│   ├── threaded/           # Threaded-specific
│   │   ├── follow-up.tsx   # Follow-up between turns
│   │   └── debrief.tsx     # Thread analysis (stubbed)
│   ├── analytics/          # Progress analytics
│   │   └── index.tsx       # Sharp Summary + charts + dimensions
│   ├── streak/             # Badge system
│   │   └── index.tsx       # Journey grid + badge collection
│   ├── premium/            # Paywall
│   │   └── index.tsx       # All 4 plans + features + pricing
│   ├── session/            # Session replay
│   │   └── [id].tsx        # Turn detail + audio playback
│   ├── context/            # User context (premium)
│   │   ├── setup.tsx       # 4 fields + documents
│   │   └── documents.tsx   # File picker
│   ├── duel/               # Duels (stubbed)
│   ├── coming-soon/        # Feature teasers
│   │   ├── conversation.tsx
│   │   ├── analytics.tsx
│   │   └── duels.tsx
│   └── _layout.tsx         # Root stack + AudioGuard + OnboardingGate
├── src/
│   ├── constants/
│   │   ├── theme.ts        # Colors, typography, spacing, shadows, wp/fp
│   │   └── badges.ts       # 15 streak badges
│   ├── components/
│   │   ├── Animations.tsx  # LoadingScreen (fox+notepad), AudioWaveBars, PulseDot, FadeIn, ScoreReveal
│   │   └── Illustrations.tsx # SharpFox, SpeechBubble, ProgressDots, ConfettiBurst, FeatureCard
│   ├── types/
│   │   └── index.ts        # All TypeScript types (45+ interfaces)
│   └── services/
│       ├── api.ts          # HTTP client (apiPost, apiGet, apiUpload)
│       ├── storage.ts      # AsyncStorage CRUD (onboarding, profile, sessions, streak, progress, cache)
│       ├── scoring.ts      # Claude API (question, score, follow-up, debrief, summary)
│       ├── transcription.ts # Base64 audio upload to backend
│       ├── tts.ts          # ElevenLabs playback + caching + natural script builder
│       └── premium.ts      # Plans, limits, usage tracking, dev flag
├── backend/
│   ├── server.js           # Express server (9 API routes, afconvert + ffmpeg transcoding)
│   ├── prompts/
│   │   └── index.js        # 6 Claude prompts (question, scoring, onboarding scoring, follow-up, debrief, doc parsing)
│   ├── package.json
│   └── .env                # API keys (gitignored)
├── PRODUCT_SPEC.md         # This file
├── ARCHITECTURE_PLAN.md    # Cloud migration plan (auth, DB, sync, RevenueCat)
├── CLAUDE.md               # Development instructions
├── package.json
├── app.json
└── tsconfig.json
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
PORT=3001
```

## Commands

```bash
npx expo start              # Start frontend
cd backend && node server.js # Start backend
npx tsc --noEmit            # Type check
npx expo export --platform ios # Build check
```

## Key Design Decisions

1. **No database in MVP** — AsyncStorage only. Ship fast, validate, add Supabase later.
2. **Duels never paywalled** — viral growth mechanic (when implemented).
3. **Positive feedback first** — always find something good, even in weak answers.
4. **Model answers built from user's response** — not generic. Keeps what was good.
5. **Dynamic timing** — AI decides 45-120s per question based on complexity.
6. **afconvert + ffmpeg on backend** — expo-audio M4A has chnl box ffmpeg can't parse; afconvert (macOS native) handles it, then ffmpeg compresses to MP3 for Groq.
7. **Generation-based audio cancellation** — prevents ghost playback across screens.
8. **Question caching by date** — daily question cached, TTS cached to disk. Minimises API costs.
9. **Recurring pattern detection** — last 5 insights passed to Claude for continuity.
10. **Premium dev flag** — instant toggle between free/pro for development.
11. **Onboarding scores soft** — dedicated prompt with +1 bias, targets 5.0-7.0 range.
12. **Fox mascot as brand identity** — appears in loading, onboarding, creates emotional connection.
13. **Value before commitment** — users complete a challenge and see scores before sign-up/payment.
