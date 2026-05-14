# Sharp AI — Communication Training App

## What this project is

Sharp trains professionals to speak clearly, concisely, and with substance under pressure. It's a React Native / Expo app with a Node.js backend. Coaching is invisibly grounded in frameworks from 8 communication science books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence) — but the app NEVER cites book names to users. It coaches like a mentor who has read everything and quotes nothing.

For the comprehensive technical reference, see `ARCHITECTURE.md`. For App Store materials, see `app-store-metadata.md`. For the current TODO state, see `TODO.md`.

## Architecture

- React Native 0.76+ with Expo SDK 52 (managed workflow + generated `ios/`/`android/`)
- Navigation: Expo Router v4 (file-based routing)
- State: AsyncStorage (local source of truth) + Supabase (cloud sync layer)
- Styling: StyleSheet.create() — NO inline styles, NO Tailwind, NO styled-components
- Backend: Node.js + Express on Railway (`https://sharp-production-2d7c.up.railway.app`)
- AI:
  - **Anthropic Claude Sonnet 4** (quality-critical paths: scoring, debrief, conversation debrief, daily question, document parsing)
  - **Anthropic Claude Haiku 4.5** (fast paths: question gen, follow-up, quality gate, progress summary, conversation setup/respond, news planning, engagement nudge)
  - Prompt caching on the scoring system prompt (~90% input cost reduction)
- Transcription: Groq Whisper Large v3 Turbo
- TTS: Together AI Kokoro-82M (primary, am_michael voice) + ElevenLabs (fallback) + expo-speech (offline)
- Auth: Apple Sign In primary, email/password fallback (Supabase)
- Subscriptions: RevenueCat + Apple IAP, 7-day free trial on first sign-up
- OTA: EAS Update on branch `feature/conversational-ai`, runtime version `2.0.0`

## Design System — Soft Dawn (Light Mode)

This is a LIGHT MODE app. Warm cream canvas, terracotta accent, sage green success.

Key colours (all from `src/constants/theme.ts`):
- Background: #FAF6F0 (cream), #FFFFFF (cards), #F5F0E8 (inputs)
- Text: #3A2A1A (primary), #7A6A5A (secondary), #A09080 (tertiary), #C0B0A0 (muted)
- Accent: #C07050 (terracotta), #FFF5EB (light accent bg), #F0DCC8 (accent border)
- Success: #5A9A5A (sage), #E8F5E8 (positive bg)
- Error: #C05050
- Duel purple: #8B7EC8
- Daily amber: in accent tones

ALL colours come from `src/constants/theme.ts`. Never hardcode colour values in screen files — always import from theme.

Font: System default (no custom fonts loaded). Weight hierarchy: 900 (black) for headings/scores, 700 (bold) for buttons/emphasis, 600 (semibold) for labels, 400 (regular) for body.

Border radius: 8 (sm), 12 (md), 16 (lg), 20 (xl), 999 (pill).

Responsive helpers: `wp()` for width-percent, `fp()` for scaled fonts. Use these instead of literals for sizing.

## File Structure

```
app/                              # Expo Router screens
├── (tabs)/                       # Tab navigator (Home, History, Settings)
│   ├── _layout.tsx
│   ├── index.tsx                 # Home — practice mode tiles, streak, usage
│   ├── history.tsx
│   └── settings.tsx              # Profile, prefs, account, plan, legal (now incl. Delete account)
├── daily/                        # Daily 30
│   ├── challenge.tsx             # 60s recording, one shared question/day
│   └── result.tsx                # Score, streak, duel CTA
├── one-shot/                     # One Shot
│   ├── question.tsx              # Audio question + difficulty
│   ├── recording.tsx             # 90s timer (shared with threaded)
│   ├── results.tsx               # 5-dim scores + coaching insight
│   └── coaching.tsx              # Snippet before/after
├── threaded/                     # Threaded Challenge
│   ├── follow-up.tsx
│   └── debrief.tsx
├── duel/                         # Sharp Duels (always free)
│   ├── create.tsx · accept.tsx · waiting.tsx · results.tsx
├── conversation/                 # Live voice (gated by FEATURES.conversation=false for v1)
│   ├── setup.tsx · live.tsx · debrief.tsx · purchase.tsx
├── onboarding/                   # 10 screens — see below
├── auth/signin.tsx               # Apple/email sign-in modal
├── context/                      # setup, documents
├── coming-soon/                  # Placeholder screens
├── premium/                      # Paywall (index) + interview-pack
├── streak/index.tsx              # Streak detail
├── analytics/index.tsx           # Progress dashboard
├── privacy/index.tsx             # In-app privacy policy
├── session/[id].tsx              # Past session detail
└── _layout.tsx                   # Root Stack — OnboardingGate, AuthProvider, PremiumSync

# Onboarding flow (10 screens, hard-gated by OnboardingGate):
# index → name → signin → challenge-intro → ai-consent → recording → result → value → paywall → welcome

src/
├── components/                   # Animations, Illustrations (SharpFox etc.)
├── constants/
│   ├── theme.ts                  # Soft Dawn — ALL colours, typography, spacing, radius
│   ├── badges.ts                 # 15 streak milestone badges
│   └── features.ts               # Feature flags
├── context/AuthContext.tsx       # Supabase session + RevenueCat logoutUser on SIGNED_OUT
├── types/index.ts                # ALL TypeScript types
└── services/                     # 16 service files
    ├── api.ts                    # HTTP client. Handles 204 No Content + empty bodies.
    ├── storage.ts                # AsyncStorage CRUD + clearAllUserData() + AI consent helpers
    ├── scoring.ts                # /api/question/generate, /api/score, threaded/*, /api/progress
    ├── transcription.ts          # /api/transcribe (Groq Whisper)
    ├── tts.ts                    # Audio playback + cache + fallback chain
    ├── premium.ts                # Tier check, usage tracking, entitlement listener
    ├── revenuecat.ts             # IAP init, purchase, restore, customerInfoUpdateListener
    ├── auth.ts                   # Apple/email sign-in + deleteAccount() (self-healing)
    ├── supabase.ts               # Supabase client (or no-op proxy)
    ├── sync.ts                   # Local → cloud writes (batched, idempotent)
    ├── analytics.ts              # PostHog wrapper
    ├── errorTracking.ts          # Sentry stub
    ├── notifications.ts          # Expo push token registration
    ├── prewarm.ts                # Boot-time audio warmup
    └── seed.ts                   # Dev-only seeding (untracked)

backend/
├── server.js                     # Express server, ~30 routes
├── prompts/index.js              # All Claude prompts + buildUserContextBlock helper
├── agent/                        # Agent runner, tools, traces, JWT auth middleware
│   ├── runner.js · tools.js · traces.js · auth.js · threaded_interrogator.js
├── migrations/                   # agent_traces SQL
└── .env                          # API keys (never commit)
```

## Code Standards

- Functional components only. No class components.
- All business logic in `src/services/` — screens are UI + state only.
- Every screen uses `SafeAreaView` from `react-native-safe-area-context`.
- `StyleSheet.create()` at bottom of every screen file, variable named `s`.
- All colours from `theme.ts`. All spacing from `theme.ts`. No magic numbers.
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

## Pricing

| Plan | Price | Notes |
|---|---|---|
| Free | £0 | Daily 30 + Duels always free. 3 One Shots/week. No coaching on Daily. |
| Monthly | £19.99/mo | 7-day free trial |
| Annual | £149.99/yr | 7-day free trial, "Save £90" framing, £12.50/mo equivalent shown as subordinate text |

**Apple 3.1.2(c) rule**: the billed amount must be the most prominent pricing element on the paywall. Per-month equivalent for annual must be smaller/muted. Enforced in `app/onboarding/paywall.tsx` and `app/premium/index.tsx` styles.

## Common Commands

```bash
# Start app (dev)
npx expo start --clear

# Start backend (local)
cd backend && node server.js

# Install new Expo package
npx expo install <package-name>

# Type check
npx tsc --noEmit

# Production build + auto-submit to App Store
eas build --platform ios --profile production --auto-submit

# OTA update (JS-only changes)
eas update --branch feature/conversational-ai --message "..."

# Backend deploy
cd backend && railway up --detach
```

## Important Context

- 5 practice modes shipping in v1: Daily 30 (60s, daily habit), One Shot (90s, full coaching), Threaded (4 turns, escalating pressure), Sharp Duels (async 1v1), Industry Insight (Pro). Conversation (live voice) is gated by `FEATURES.conversation = false` for v1.
- Daily 30 uses the SAME question for all users each day (enables duels)
- Duels are async — Player 1 records, shares link, Player 2 records later
- Duels should NEVER be paywalled — they're the viral growth mechanic
- The recording screen at `one-shot/recording.tsx` is SHARED between One Shot and Threaded flows
- TTS uses Together AI Kokoro by default (cost), ElevenLabs as fallback, on-device `expo-speech` as final fallback. **Critical**: Kokoro `stream: false` (true returns SSE not MP3)
- Coaching insight is a single sentence — the most memorable, actionable advice grounded in communication frameworks but NEVER naming the source
- All prompts are in `backend/prompts/index.js` — the scoring prompt contains invisible coaching principles from 8 books
- `buildUserContextBlock(context)` produces a natural-language narrative used in all prompts (instead of JSON.stringify dumps) — significantly more personalised output

## Privacy & compliance

- **AI consent** is gated at `/onboarding/ai-consent`. Flag stored as `sharp:ai_consent_v1`. Retro-gate in OnboardingGate (`app/_layout.tsx`) catches existing users + restore-on-new-device. No AI call fires without `hasAIConsent() === true`.
- **Account deletion** in Settings → Account → Delete account. Two-step confirm (Alert.alert + Alert.prompt). Calls `POST /api/account/delete` (Bearer-authed) → `supabase.auth.admin.deleteUser` → cascades through all user tables. Local AsyncStorage wiped via `clearAllUserData()`. Idempotent — handles double-tap + stale token after first attempt.
- **Audio** is sent to Groq for transcription and deleted from Sharp servers in `finally{}` block. Never persisted on backend. Local recording file persists on device for playback in history until account delete.
- **Privacy policy** at `app/privacy/index.tsx` has a dedicated "AI Processing & Consent" section listing all four providers (Anthropic, Groq, ElevenLabs, Together AI), what's sent to each, and zero-retention API terms.
- **EULA**: Apple standard `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` linked in App Description + tappably in-app on paywall + Settings → Legal.

## Build & release

- Bundle ID: `com.sharp.ai`
- App version: `2.0.0`
- Runtime version (for OTA): `2.0.0`
- App Store Connect App ID: `6761378418`
- Apple Team ID: `9HQYKH65D3`
- EAS Update URL: `https://u.expo.dev/12e05e54-293d-47be-8857-4ad2a55926ff`
- Production build profile (`eas.json`) auto-increments build number + auto-submits

## Testing

No test framework set up yet. When adding tests:
- Jest + React Native Testing Library for component tests
- Test files colocated: `Component.test.tsx` next to `Component.tsx`
- Service tests in `src/services/__tests__/`

## What NOT to do

- Don't add Tailwind, NativeWind, or any CSS-in-JS library
- Don't switch to dark mode — this is a light mode app (Soft Dawn)
- Don't add a remote DB other than Supabase
- Don't create separate CSS/style files — styles live in each screen file
- Don't use expo-linear-gradient — removed from this version
- Don't name communication books in any user-facing text
- Don't paywall Daily 30 or Duels — viral growth
- Don't put per-month equivalent prices larger than the billed amount on paywalls — Apple 3.1.2(c) rejection guaranteed
- Don't bypass the AI consent gate — third-party AI calls must be after `hasAIConsent() === true`
- Don't store user audio recordings on Sharp's backend — delete after transcription in `finally{}`

## What NOT to commit

- `.env` files (any of them)
- `screenshots/` (App Store screenshots, untracked)
- `ios/` and `android/` (regenerated by `expo prebuild`)
- `scripts/` (local utilities, untracked)
- `backend/ai-service/` (Python WIP, untracked)
- `src/services/seed.ts` (dev-only, untracked)
- `app/dev/*` (dev tools, untracked)
