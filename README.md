# Sharp AI — Communication Training App

Sharp trains professionals to speak clearly, concisely, and with substance under pressure. iOS-first communication coach. Record your spoken answer → get scored across 5 dimensions → get one memorable coaching insight grounded in 8 communication books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence) — never named to users.

> **Status (2026-05-14):** Pre-launch. Backend live on Railway. iOS Build 9 in App Store Connect resubmission queue. See [ARCHITECTURE.md](ARCHITECTURE.md) for the technical deep dive and [app-store-metadata.md](app-store-metadata.md) for App Store materials.

---

## Features

**Six practice modes** — four shipping in v1:

- **Daily 30** (free, 60s) — one shared question per day, builds habit, enables Duels
- **One Shot** (free 3/wk, Pro 3/day, 90s) — full coaching insight + snippet rewrite + model answer
- **Threaded Challenge** (Pro, up to 4 turns) — escalating follow-ups, full debrief at end
- **Sharp Duels** (always free) — async 1v1 on the day's question, side-by-side comparison
- **Industry Insight** (Pro) — questions seeded by real news in user's field
- **Conversation** (gated off for v1) — live two-way voice via ElevenLabs

**Five scoring dimensions** (1-10):
1. **Structure** — lead with the point or bury it?
2. **Concision** — does every word earn its place?
3. **Substance** — specific, or filling air?
4. **Filler Words** — ums, likes, basicallys
5. **Awareness** — industry / company / audience knowledge

**Personalisation**: user context (role, company, situation, dream role) + uploaded documents (CV, JD, briefs) flow into every prompt via a natural-language `buildUserContextBlock` helper. Coaching quotes back the user's exact words.

---

## Tech stack

- **Frontend**: React Native 0.76+, Expo SDK 52, Expo Router v4 (file-based), TypeScript strict
- **Backend**: Node.js + Express on Railway (`https://sharp-production-2d7c.up.railway.app`)
- **AI**: Anthropic Claude — **Sonnet 4** for quality-critical paths, **Haiku 4.5** for fast paths, with prompt caching
- **Transcription**: Groq Whisper Large v3 Turbo
- **TTS**: Together AI Kokoro-82M (primary, cost), ElevenLabs (fallback), `expo-speech` (offline)
- **Auth + DB**: Supabase (Apple Sign In, Postgres + Storage, JWT)
- **Subscriptions**: RevenueCat + Apple IAP, 7-day free trial on first sign-up
- **Build / OTA**: EAS Build + EAS Update (channel `feature/conversational-ai`, runtime `2.0.0`)
- **Analytics**: PostHog (client + server)
- **Push**: Expo Notifications

---

## Pricing

| Plan | Price | What's included |
|---|---|---|
| Free | £0 | Daily 30 + Duels always free, 3 One Shots/week, no coaching insight on Daily |
| Monthly | **£19.99/mo** | 7-day free trial, full coaching, 3 One Shots/day, 2 Threaded/day |
| Annual | **£149.99/yr** | 7-day free trial, "Save £90" framing, £12.50/mo equivalent (subordinate per Apple 3.1.2(c)) |

Apple Small Business Program (15% cut) recommended for v1.

---

## Design — Soft Dawn

Light mode. Warm cream (`#FAF6F0`) canvas, terracotta (`#C07050`) accent, sage (`#5A9A5A`) success. Border radius rounded organic shapes (8, 12, 16, 20, 999 pill).

All colours from `src/constants/theme.ts`. No hardcoded values in screen files. No Tailwind, no styled-components — just `StyleSheet.create()`.

---

## Setup

### Prereqs
- Node 18+, npm 9+
- Expo CLI: `npm i -g expo eas-cli`
- iOS device or simulator (Apple Sign In doesn't work in simulator)
- Apple Developer account (for builds)

### Backend

```bash
cd backend
cp .env.example .env
# Fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GROQ_API_KEY=gsk_...
#   ELEVENLABS_API_KEY=...
#   KOKORO_TTS_URL=... (Together AI endpoint)
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   POSTHOG_API_KEY=...
#   REVENUECAT_WEBHOOK_SECRET=...

npm install
node server.js
# Local: http://localhost:3001
# Prod: https://sharp-production-2d7c.up.railway.app
```

### App

```bash
# Install deps
npm install

# Start Metro
npx expo start

# Run on real device via dev build
eas build --profile development --platform ios
# install IPA, scan QR, run

# Or production build (with App Store auto-submit)
eas build --platform ios --profile production --auto-submit
```

### OTA updates

```bash
# JS-only changes ship via EAS Update — no rebuild needed
eas update --branch feature/conversational-ai --message "your message"
```

Reloads on next two app launches.

---

## Project structure

```
app/
├── (tabs)/               # Home, History, Settings
├── daily/                # Daily 30
├── one-shot/             # 90s scored session
├── threaded/             # 4-turn escalating
├── duel/                 # Async 1v1
├── conversation/         # Live voice (off for v1)
├── onboarding/           # 10 screens incl. ai-consent
├── auth/signin.tsx       # Apple/email modal
├── premium/              # Paywall
├── privacy/              # In-app policy
└── _layout.tsx           # Root Stack + OnboardingGate

src/
├── constants/            # theme.ts, badges.ts, features.ts
├── context/              # AuthContext.tsx
├── services/             # 16 service files
└── types/index.ts        # Single source of truth

backend/
├── server.js             # Express, ~30 routes
├── prompts/index.js      # All Claude prompts + buildUserContextBlock
├── agent/                # Runner, tools, traces, JWT middleware
└── migrations/           # agent_traces.sql
```

---

## Key API routes (selected)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Healthcheck |
| GET | `/api/daily-question` | Promise-locked, one Claude call per day |
| POST | `/api/question/generate` | Haiku, personalised |
| POST | `/api/score` | Sonnet, cached system prompt |
| POST | `/api/threaded/follow-up` | Haiku |
| POST | `/api/threaded/debrief` | Sonnet, full thread analysis |
| POST | `/api/transcribe` | Groq Whisper, audio deleted after |
| POST/GET | `/api/tts` | Together AI Kokoro / ElevenLabs, server-cached |
| POST | `/api/document/parse` | Sonnet classification |
| POST | `/api/webhooks/revenuecat` | Hardened |
| POST | `/api/account/delete` | Bearer-authed, cascade delete via Supabase admin |

Full list in [ARCHITECTURE.md §9](ARCHITECTURE.md#9-backend--express-backendserverjs).

---

## Privacy posture

**What we send to third parties** (with user consent on first launch via `/onboarding/ai-consent`):
- Voice audio → Groq for transcription, deleted immediately
- Transcript + context → Anthropic for scoring + coaching
- Question text → ElevenLabs / Together AI for TTS
- Documents → Anthropic for parsing

**What we don't do**:
- Audio files NOT stored on Sharp servers (deleted in `finally{}` after transcription)
- No data sold or shared with advertisers
- No training on user data — all providers under zero-retention API terms

**Consent gate**: `app/onboarding/ai-consent.tsx` discloses providers + What/Who/Why before any third-party call. Retro-gate in OnboardingGate ensures existing users see it on next launch. Flag stored as `sharp:ai_consent_v1`.

**Account deletion**: Settings → Account → Delete account. Two-step confirmation. Calls `supabase.auth.admin.deleteUser` server-side which cascades through all user tables. Local AsyncStorage wiped via `clearAllUserData()`.

---

## Cost per session (rough, with Haiku swap + prompt caching)

| Mode | Cost |
|---|---|
| Daily 30 | ~£0.006 |
| One Shot | ~£0.025 (cached scoring) |
| Threaded | ~£0.08 (4 turns + debrief) |
| Duel | ~£0.006 incremental (same Daily question) |

---

## Documentation

| File | What |
|---|---|
| `README.md` | This file — overview + quick start |
| `ARCHITECTURE.md` | Master technical reference (current state) |
| `CLAUDE.md` | Coding conventions for AI agents |
| `PRODUCT_BRIEF_FOR_PRICING.md` | Comprehensive product brief (15 sections) |
| `app-store-metadata.md` | App Store metadata, EULA, Review Notes, rejection reply |
| `TODO.md` | Pre-launch + post-launch checklist |
| `DEV-SETUP.md` | Local dev environment setup |

---

## License

© 2026 Sharp AI. All rights reserved.
