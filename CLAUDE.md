# Sharp AI — Communication Training App

## What this project is

Sharp trains professionals to speak clearly, concisely, and with substance under pressure. It's a React Native / Expo app with a Node.js backend. Coaching is invisibly grounded in frameworks from 8 communication science books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence) — but the app NEVER cites book names to users. It coaches like a mentor who has read everything and quotes nothing.

## Architecture

- React Native 0.76+ with Expo SDK 52 (managed workflow)
- Navigation: Expo Router v4 (file-based routing)
- State: AsyncStorage (local persistence, no remote DB in MVP)
- Styling: StyleSheet.create() — NO inline styles, NO Tailwind, NO styled-components
- Backend: Node.js + Express on port 3001
- AI: Claude API (Sonnet 4.6) for all intelligence
- Transcription: Groq (Whisper Large v3 Turbo)
- TTS: ElevenLabs with on-device Speech fallback

## Design System — Soft Dawn (Light Mode)

This is a LIGHT MODE app. Warm cream canvas, terracotta accent, sage green success.

Key colours:
- Background: #FAF6F0 (cream), #FFFFFF (cards), #F5F0E8 (inputs)
- Text: #3A2A1A (primary), #7A6A5A (secondary), #A09080 (tertiary), #C0B0A0 (muted)
- Accent: #C07050 (terracotta), #FFF5EB (light accent bg), #F0DCC8 (accent border)
- Success: #5A9A5A (sage green)
- Error: #C05050
- Duel purple: #8B7EC8
- Daily amber: in accent tones

ALL colours come from `src/constants/theme.ts`. Never hardcode colour values in screen files — always import from theme.

Font: System default (no custom fonts loaded). Weight hierarchy: 900 (black) for headings/scores, 700 (bold) for buttons/emphasis, 600 (semibold) for labels, 400 (regular) for body.

Border radius: 8 (sm), 12 (md), 16 (lg), 20 (xl), 999 (pill).

## File Structure

```
app/                          # Expo Router screens
├── (tabs)/                   # Tab navigator (Home, History, Settings)
│   ├── _layout.tsx
│   ├── index.tsx             # Home screen
│   ├── history.tsx
│   └── settings.tsx
├── daily/                    # Daily 30 flow
│   ├── challenge.tsx         # Question + 30s recording
│   └── result.tsx            # Score + insight + duel CTA
├── one-shot/                 # One Shot flow
│   ├── question.tsx          # Audio question + difficulty
│   ├── recording.tsx         # 90s timer + live transcript (shared with threaded)
│   ├── results.tsx           # 5-dimension scores + coaching insight
│   └── coaching.tsx          # Snippet before/after
├── threaded/                 # Threaded Challenge
│   ├── follow-up.tsx         # Follow-up between turns
│   └── debrief.tsx           # Thread analysis
├── duel/                     # Sharp Duels
│   ├── create.tsx            # Share link + waiting
│   ├── accept.tsx            # Opponent records
│   ├── waiting.tsx
│   └── results.tsx           # Side-by-side comparison
├── context/                  # Context setup
│   ├── setup.tsx             # 4 text fields + doc list
│   └── documents.tsx         # Document picker + upload
├── coming-soon/              # Placeholder screens
│   ├── conversation.tsx
│   └── analytics.tsx
├── session/
│   └── [id].tsx              # Session detail
└── _layout.tsx               # Root Stack layout

src/
├── constants/theme.ts        # ALL colours, typography, spacing, radius
├── types/index.ts            # ALL TypeScript types
└── services/
    ├── api.ts                # HTTP client (apiPost, apiGet, apiUpload)
    ├── storage.ts            # AsyncStorage CRUD for all data
    ├── scoring.ts            # generateQuestion, scoreAnswer, generateFollowUp, generateDebrief
    ├── transcription.ts      # Groq/Whisper via backend
    └── tts.ts                # ElevenLabs + device fallback

backend/
├── server.js                 # Express server, 6 API routes
├── prompts/index.js          # All Claude prompts (question engine, scoring, follow-up, debrief, doc parsing)
└── .env                      # API keys (never commit)
```

## Code Standards

- Functional components only. No class components.
- All business logic in services/ — screens are UI + state only.
- Every screen uses SafeAreaView from react-native-safe-area-context.
- StyleSheet.create() at bottom of every screen file, variable named `s`.
- All colours from theme.ts. All spacing from theme.ts. No magic numbers.
- TypeScript strict mode. All props typed. No `any` except FormData workarounds.

## Scoring Dimensions (5)

1. Structure (1-10)
2. Concision (1-10)
3. Substance (1-10)
4. Filler Words (1-10)
5. Awareness (1-10) — industry/company knowledge, defaults to 7 when not relevant

## Document Classification (4 types)

- Identity (CV, resume) → blue chip #4080C0
- Aspiration (job desc, promo criteria) → purple chip #8B7EC8
- Evidence (project brief, review) → green chip #5A9A5A
- Preparation (agenda, talking points) → terracotta chip #C07050

## Common Commands

```bash
# Start app
npx expo start

# Start backend
cd backend && node server.js

# Install new Expo package
npx expo install <package-name>

# Clear Metro cache
npx expo start --clear

# Type check
npx tsc --noEmit
```

## Important Context

- The app has 4 practice modes: Daily 30 (30s, daily habit), One Shot (90s, full coaching), Threaded (4 turns, escalating pressure), Sharp Duels (async 1v1)
- Daily 30 uses the SAME question for all users each day (enables duels)
- Duels are async — Player 1 records, shares link, Player 2 records later
- Duels should NEVER be paywalled — they're the viral growth mechanic
- The recording screen at one-shot/recording.tsx is SHARED between One Shot and Threaded flows
- ElevenLabs TTS is used for One Shot and Threaded questions. Daily 30 is text-only (no TTS).
- Coaching insight is a single sentence — the most memorable, actionable advice grounded in communication frameworks but NEVER naming the source
- All prompts are in backend/prompts/index.js — the scoring prompt contains invisible coaching principles from 8 books

## Testing

No test framework is set up yet. When adding tests:
- Jest + React Native Testing Library for component tests
- Test files colocated: `Component.test.tsx` next to `Component.tsx`
- Service tests in `src/services/__tests__/`

## What NOT to do

- Don't add Tailwind, NativeWind, or any CSS-in-JS library
- Don't switch to dark mode — this is a light mode app (Soft Dawn)
- Don't add Supabase or any remote DB yet — MVP uses AsyncStorage only
- Don't create separate CSS/style files — styles live in each screen file
- Don't use expo-linear-gradient — removed from this version
- Don't name communication books in any user-facing text
- Don't paywall Daily 30 or Duels
