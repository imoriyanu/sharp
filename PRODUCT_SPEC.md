# Sharp AI — Complete Product Specification

> **Last updated:** 2026-03-25
> **Version:** 2.1.0 (MVP+)
> **Status:** Working prototype with premium system, analytics, and full practice flows

---

## What Sharp Is

Sharp trains people to speak clearly, concisely, and with substance — in every area of life. It's a communication coaching app powered by Claude AI, with real-time voice recording, transcription, 5-dimension scoring, and personalised feedback.

Coaching is invisibly grounded in frameworks from 8 communication science books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence). The app NEVER cites book names — it coaches like a mentor who has read everything and quotes nothing.

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
| Recording | expo-audio (AudioRecorder) + ffmpeg backend re-encode |
| Playback | expo-audio (createAudioPlayer) with disk caching |
| Backend | Node.js + Express on port 3001 |
| Design System | Soft Dawn (warm cream light mode) |

---

## Premium System (Fully Implemented)

### Dev Flag
`src/services/premium.ts` line 6: `DEV_PREMIUM_FLAG = true/false` — toggles between premium and free tier for development.

### Plans

| Plan | Price | Per Month | Savings |
|------|-------|-----------|---------|
| 30-Day Pass | €19.99 one-time | €19.99 | No commitment |
| Monthly | €12.99/mo | €12.99 | — |
| Annual (recommended) | €95.88/yr | €7.99 | 38% |
| 3-Year | €215.64/3yr | €5.99 | 54%, best value |

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
- **Home screen:** Context card shows 🔒 + PRO badge for free users → taps to paywall. Sharp Summary same.
- **Mode cards:** One Shot/Threaded check daily/weekly limits before navigating. Over limit → paywall.
- **Results screen:** "Practice the sharper version" shows 🔒 for free, remaining count for pro, greyed at 0.
- **Coaching screen:** Practice button locked for free. Shows remaining + greys at limit for pro.
- **Session detail:** "Practice again" locked for free. Shows remaining for pro.
- **Usage tracked:** Daily counts in AsyncStorage, auto-reset. Weekly threaded for free resets Monday.
- **Paywall screen:** `/premium` — feature comparison, 4 plan cards with badges, restore purchase, legal text.

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
- Auto-spoken feedback leads with praise: "Really solid. Your structure was strong..."
- Even a 3/10 answer gets genuine positive feedback

---

## Practice Modes

### 1. Daily Challenge (Fully Working)

- **Timer:** Dynamic 45-120 seconds (set by AI based on question complexity)
- **Frequency:** One per day, cached locally (zero repeat API calls)
- **5 question formats** with natural mix:
  - **Prompt** (~30%): Simple, direct questions. 45-60s.
  - **Context** (~25%): About YOUR actual life/work. 60-90s.
  - **Roleplay** (~25%): Vivid scenes with names, stakes, details. 90-120s.
  - **Briefing** (~10%): Background facts → act on them. 60-90s.
  - **Pressure** (~10%): Tense moments, high stakes. 60-90s.
- **Rich scenarios:** Every roleplay/pressure/briefing includes specific names, events, dialogue, stakes. Even without user context, Claude invents believable worlds.
- **Context-aware:** Uses role, company, situation, documents to personalise.
- **TTS:** Natural spoken delivery with greeting + transitions. ElevenLabs with device fallback.
- **Audio caching:** Question audio cached to disk. Replay costs zero API calls.
- **Question caching:** Today's question cached by date. Re-opening app loads instantly.
- **Recent question tracking:** Last 20 questions stored. Claude avoids repeating themes/categories.
- **Empty/short response handling:** < 5 words → retry screen with tips, no API credits wasted.

**Output after recording:**
- 5-dimension scores with progress bars
- "What went well" ✅ (positive, spoken)
- "To work on" 🎯 (constructive)
- Coaching insight 💡 (1 actionable sentence, spoken)
- Communication tip (broader technique for this question type)
- Suggested angles (2-3 alternative approaches)
- Model answer ✨ (9/10 answer built from their response, spoken)
- Streak update + badge unlock celebration

### 2. One Shot (Fully Working)

- **Timer:** Dynamic 45-120s based on AI assessment
- **Same question engine** as Daily Challenge
- **Full results dashboard** with animated score reveal, staggered fade-ins
- **Model Answer** — complete 9/10 answer built FROM their response, tappable to listen
- **Snippet Coaching** — listen to model → record your version → get similarity feedback → retry
- **Practice gated by premium** — free users see paywall, pro users see remaining count

### 3. Threaded Challenge (Partially Working)

- **4 turns** of escalating pressure with specific follow-ups referencing user's words
- Turn 1: Initial → Turn 2: Probing → Turn 3: Pressing → Turn 4: Pressure
- **Debrief:** UI complete with placeholder data

### 4. Sharp Duels (Coming Soon — UI Complete)

- Screens built: Create, Accept, Waiting, Results + Coming Soon modal
- Async 1v1 with shared questions, side-by-side scores

---

## Sharp Summary & Progress Analytics (Fully Working)

### Sharp Summary (30-second spoken review)
- Claude analyses all session data and generates a natural, spoken progress summary
- Auto-plays on opening analytics screen
- References specific numbers: "your substance went from 4.0 to 5.8"
- Celebrates improvements, reframes plateaus constructively
- Ends with ONE specific focus area

### Analytics Screen
- **Key stats grid:** Total sessions, streak, best score, sessions this week
- **Score trend chart:** Bar chart of last 15 scores, color-coded
- **Dimension breakdown:** 5 dimensions with bars, averages, and change arrows (↑↓)
- **Focus area:** AI-recommended dimension to work on
- **Highlights:** 3-4 bullet-point achievements
- **Filler word trend:** Early vs recent comparison
- **Recent coaching insights:** Last 3 insights from sessions
- **Locked for free users** — shows PRO badge, taps to paywall

---

## Streak & Badges System (Fully Working)

### 15 Badge Milestones (up to 365 days)

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

### Streak Freeze (Anti-Churn)
- 1 free freeze per week (resets Monday)
- Auto-activates if you miss a day — streak preserved
- Frozen days show ❄️ in journey grid
- Visible in streak screen stats row

### Streak Screen
- Hero card: current streak + badge emoji + stats row (best/badges/freeze)
- Freeze info card explaining how it works
- Next badge teaser with progress bar
- Dynamic journey grid (extends beyond 30 days based on streak)
- Two badge sections: "First 30 Days" and "The Long Game"
- Badge unlock celebrations on daily result screen

---

## User Profile & Context

### Profile (Settings)
- Display name (editable inline)
- Avatar (pick from device photo library via expo-image-picker)
- Shows in home screen: "Good afternoon" + large name on second line
- Plan status: Free or Sharp Pro with PRO badge

### Context Setup (Premium Only)
- 4 fields: Role, Company, Situation, Dream role
- Progress indicator (N/4 fields)
- Each field in its own card with emoji icon
- Document list with type classification chips
- File picker for PDF/DOCX/TXT/MD

---

## Audio System

### Recording (expo-audio)
- `AudioModule.AudioRecorder` with `RecordingPresets.HIGH_QUALITY`
- Outputs M4A on iOS
- Base64 encoded and sent to backend
- Backend re-encodes via ffmpeg to MP3 (16kHz, mono, 64kbps) for Groq compatibility

### Playback (expo-audio + ElevenLabs)
- `createAudioPlayer` for ElevenLabs MP3 playback
- Audio cached to disk by text hash — replay costs zero
- Device speech (expo-speech) as automatic fallback
- Natural script builder: adds greetings, transitions based on question format

### State Management
- Generation-based cancellation — `playbackGeneration` counter prevents stale callbacks
- Global `AudioGuard` in root layout — stops all audio on every route change
- `mountedRef` in every screen — prevents state updates after unmount
- No audio can leak between screens

---

## Animations

| Component | Used For |
|-----------|----------|
| LoadingScreen | Full-screen branded loader (logo spring + bouncing dots) |
| AudioWaveBars | 24-bar wave visualiser for recording/playback |
| PulseDot | Breathing red dot for recording indicator |
| FadeIn | Slide-up fade with staggered delays |
| ScoreReveal | Animated score counter with spring bounce |
| SkeletonLoader | Shimmer placeholder |

---

## Backend API (7 Active Endpoints)

| Endpoint | Method | Purpose | Model |
|----------|--------|---------|-------|
| `/api/health` | GET | Health check + key validation | — |
| `/api/question/generate` | POST | Generate practice question | Claude (800 tokens) |
| `/api/score` | POST | Score + full feedback + model answer | Claude (1500 tokens) |
| `/api/threaded/follow-up` | POST | Generate follow-up question | Claude (400 tokens) |
| `/api/threaded/debrief` | POST | Thread-level analysis | Claude (2000 tokens) |
| `/api/transcribe` | POST | Base64 audio → ffmpeg → Groq Whisper | Groq |
| `/api/tts` | GET | Text → ElevenLabs audio stream | ElevenLabs |
| `/api/progress/summary` | POST | AI progress summary from session data | Claude (600 tokens) |
| `/api/document/parse` | POST | Document classification (stubbed) | Claude (1000 tokens) |

---

## What's Fully Working

- ✅ Daily Challenge (5 formats, dynamic timing, caching, TTS, streak)
- ✅ One Shot (full flow: question → record → score → model answer → coaching)
- ✅ Threaded (turns 1-3 with follow-ups, recording, scoring)
- ✅ 5-dimension scoring with progression awareness + recurring pattern detection
- ✅ Positive-first feedback (positives → improvements → insight)
- ✅ Model answers (built from user's response, spoken via TTS)
- ✅ Snippet coaching with practice recording + similarity feedback
- ✅ ElevenLabs TTS with caching + device fallback + natural script builder
- ✅ Groq Whisper transcription via base64 + ffmpeg
- ✅ Streak system with 15 badges (up to 365 days) + streak freeze
- ✅ Sharp Summary (30-second AI-spoken progress review)
- ✅ Progress analytics (score trends, dimension breakdown, filler tracking)
- ✅ Premium system (4 plans, usage tracking, feature gating, paywall screen)
- ✅ Session history with full detail view + audio playback for all content
- ✅ User profile (name, avatar, plan status)
- ✅ Context setup with progress indicator (premium only)
- ✅ Professional animations (loading, wave bars, fade-ins, score reveal)
- ✅ Audio state management (generation-based, mounted refs, global guard)
- ✅ Empty/short response handling (retry screen with tips)
- ✅ Question variety (12+ categories, 5 formats, recent tracking, context-aware)
- ✅ Responsive UI (wp/fp scaling to all screen sizes)

## What's Stubbed / Coming Soon

- ⚠️ Threaded debrief (UI done, placeholder data)
- ⚠️ Document upload parsing (picker works, API not connected)
- ⚠️ Settings preferences (toggles don't persist)
- ⚠️ Session export
- ⚠️ In-app purchases (paywall UI complete, no payment processing)
- 🔜 Sharp Duels (UI complete, not integrated)
- 🔜 Conversation Practice (real-time voice AI)
- 🔜 User authentication + cloud sync
- 🔜 Push notifications for daily reminders

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
│   │   └── index.tsx       # Plans + features + pricing
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
│   └── _layout.tsx         # Root stack + AudioGuard
├── src/
│   ├── constants/
│   │   ├── theme.ts        # Colors, typography, spacing, shadows, wp/fp
│   │   └── badges.ts       # 15 streak badges
│   ├── components/
│   │   └── Animations.tsx  # LoadingScreen, AudioWaveBars, PulseDot, FadeIn, ScoreReveal
│   ├── types/
│   │   └── index.ts        # All TypeScript types (40+ interfaces)
│   └── services/
│       ├── api.ts          # HTTP client (apiPost, apiGet, apiUpload)
│       ├── storage.ts      # AsyncStorage CRUD (profile, sessions, streak, progress, cache)
│       ├── scoring.ts      # Claude API (question, score, follow-up, debrief, summary)
│       ├── transcription.ts # Base64 audio upload to backend
│       ├── tts.ts          # ElevenLabs playback + caching + natural script builder
│       └── premium.ts      # Plans, limits, usage tracking, dev flag
├── backend/
│   ├── server.js           # Express server (8 API routes, ffmpeg transcoding)
│   ├── prompts/
│   │   └── index.js        # All Claude prompts (question, scoring, follow-up, debrief, doc parsing)
│   ├── package.json
│   └── .env                # API keys
├── PRODUCT_SPEC.md         # This file
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
6. **ffmpeg on backend** — expo-audio M4A has moov atom at end; ffmpeg re-encodes to MP3 for Groq.
7. **Generation-based audio cancellation** — prevents ghost playback across screens.
8. **Question caching by date** — daily question cached, TTS cached to disk. Minimises API costs.
9. **Recurring pattern detection** — last 5 insights passed to Claude for continuity.
10. **Premium dev flag** — instant toggle between free/pro for development.
