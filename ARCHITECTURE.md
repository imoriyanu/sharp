# Sharp AI — Architecture

> **Snapshot of the current state of the codebase on `feature/conversational-ai`** as of 2026-05-14.
> Pre-launch, post-App-Store-rejection-fixes, production backend live on Railway.
> For codebase conventions, see `CLAUDE.md`. For App Store materials, see `app-store-metadata.md`.

---

## 1. What Sharp is

A communication-training iOS app for professionals. Users record short spoken answers under pressure, the app transcribes + scores them across 5 dimensions, and returns a single-sentence coaching insight grounded in 8 communication books (Pyramid Principle, Made to Stick, Radical Candor, Never Split the Difference, Crucial Conversations, Talk Like TED, NVC, Influence) — **never named in user-facing copy**.

Six practice modes, four currently shipped:
- **Daily 30** (free, 60s, one question per day shared by everyone — enables Duels)
- **One Shot** (free 3/week, 90s, full coaching insight + snippet rewrite + model answer)
- **Threaded Challenge** (Pro, up to 4 escalating follow-ups, full debrief at the end)
- **Sharp Duels** (always free, async 1v1 on the day's question — viral mechanic)
- **Industry Insight** (Pro, questions seeded by real news in user's field)
- **Conversation** (live two-way voice, gated behind `FEATURES.conversation` flag — off for v1)

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native 0.76+, Expo SDK 52 (managed workflow + generated `ios/` & `android/` dirs), New Architecture enabled |
| Routing | Expo Router v4 (file-based) |
| Local state | AsyncStorage |
| Cloud state | Supabase (Postgres + Auth + Storage + service-role admin client server-side) |
| Auth | Apple Sign In primary, email/password fallback (Supabase) |
| Styling | `StyleSheet.create()` only — no Tailwind, no styled-components, all colours from `theme.ts` |
| Backend | Node.js + Express on Railway (`https://sharp-production-2d7c.up.railway.app`) |
| LLM | Anthropic Claude — **Sonnet 4** (quality-critical) + **Haiku 4.5** (fast paths) with prompt caching |
| Transcription | Groq Whisper Large v3 Turbo |
| TTS | Together AI Kokoro-82M (primary, cost), ElevenLabs (fallback), `expo-speech` (offline) |
| Live voice | ElevenLabs Conversational AI (Conversation feature, off for v1) |
| Payments | RevenueCat (Apple IAP, App Store subscriptions, 7-day free trial) |
| Push | Expo Notifications + Expo Push token registration |
| Analytics | PostHog (client + server) |
| Build | EAS Build + auto-submit |
| OTA | EAS Update (branch `feature/conversational-ai`, runtime version `2.0.0`) |

---

## 3. Pricing model

| Plan | Price | Notes |
|---|---|---|
| Free | £0 | Daily 30 + Duels always free. **3 One Shots per week**. No coaching insight on Daily. |
| Monthly | £19.99/mo | 7-day free trial on first sign-up |
| Annual | £149.99/yr | 7-day free trial + "Save £90" framing. £12.50/mo equivalent shown subordinate to billed amount per Apple 3.1.2(c) |

Subscription products defined in App Store Connect + RevenueCat: `sharp_monthly`, `sharp_annual`. Free trial = Apple Introductory Offer on both products. Apple Small Business Program enrolment recommended (15% vs 30% cut).

Premium unlocks: 3 One Shots/day, 2 Threaded/day, 2 Industry/day, full coaching insight on Daily, document uploads, progress analytics, model answers, audio coaching summaries.

**Pricing hierarchy on paywall (post-rejection fix):** the billed amount (£149.99/yr or £19.99/mo) is the largest+boldest pricing element. Per-month equivalent ("£12.50/mo equivalent") shown beneath in muted subordinate text. Apple-compliant.

---

## 4. Directory layout

```
sharp-v2/
├── app/                              # Expo Router screens
│   ├── (tabs)/                       # Home, History, Settings
│   ├── daily/                        # challenge + result
│   ├── one-shot/                     # question, recording, results, coaching
│   ├── threaded/                     # follow-up, debrief
│   ├── duel/                         # create, accept, waiting, results
│   ├── conversation/                 # setup, live, debrief (behind flag for v1)
│   ├── onboarding/                   # 10 screens — see §5
│   ├── auth/signin.tsx               # Apple/email sign-in modal
│   ├── context/                      # setup, documents
│   ├── premium/                      # paywall (index) + interview-pack
│   ├── session/[id].tsx              # past-session detail
│   ├── streak/                       # streak detail
│   ├── analytics/                    # progress dashboard
│   ├── privacy/index.tsx             # in-app privacy policy
│   ├── coming-soon/                  # placeholder screens
│   └── _layout.tsx                   # Root Stack + boot orchestration
├── src/
│   ├── components/                   # Animations, Illustrations (SharpFox, etc.)
│   ├── constants/
│   │   ├── theme.ts                  # Soft Dawn palette, typography, spacing, radius
│   │   ├── badges.ts                 # 15 streak milestone badges
│   │   └── features.ts               # Feature flags (conversation OFF, agenticThreaded OFF)
│   ├── context/AuthContext.tsx       # Supabase session + isAuthenticated + RevenueCat logoutUser on SIGNED_OUT
│   ├── services/                     # 16 service files — see §7
│   └── types/index.ts                # Single source of truth for types
├── backend/
│   ├── server.js                     # Express — ~30 routes
│   ├── prompts/index.js              # Claude prompts + buildUserContextBlock helper
│   ├── agent/                        # Agent runner, tools, traces, JWT middleware
│   │   ├── runner.js
│   │   ├── tools.js                  # 7 retrieval tools
│   │   ├── traces.js                 # PostHog + agent_traces table
│   │   ├── auth.js                   # makeVerifyUser middleware
│   │   └── threaded_interrogator.js
│   ├── migrations/                   # SQL for agent_traces table
│   └── ai-service/                   # Python FastAPI (untracked, not yet wired)
├── assets/                           # Icons, fonts, conversation.html
├── landing/                          # Privacy policy HTML hosted at speaksharpai.com
├── ios/   android/                   # Native projects (generated, gitignored)
├── app.config.ts                     # Expo config — bundle ID com.sharp.ai, runtime 2.0.0
├── eas.json                          # Build profiles (development, preview, production)
├── ARCHITECTURE.md                   # This file
├── CLAUDE.md                         # Coding conventions for AI agents
├── README.md                         # High-level overview
├── PRODUCT_BRIEF_FOR_PRICING.md      # Comprehensive product spec
├── app-store-metadata.md             # All App Store materials
├── TODO.md                           # Post-launch checklist
└── DEV-SETUP.md                      # Local dev setup
```

---

## 5. Onboarding flow

10 screens in this order, with a hard gate before any AI call:

```
/onboarding/index             Welcome ("You don't have a speaking problem...")
/onboarding/name              Capture first name
/onboarding/signin            Apple Sign In (or skip)
/onboarding/challenge-intro   "Your first challenge" — tap Start speaking
/onboarding/ai-consent        ✨ NEW: discloses providers + What/Who, must tap Continue
/onboarding/recording         60s recording, mic permission
/onboarding/result            Score reveal + insight
/onboarding/value             Pro features (with FEATURES.conversation gate)
/onboarding/paywall           7-day trial paywall with Privacy + Terms links
/onboarding/welcome           Final "You're in" screen
```

### AI consent gate

`app/onboarding/ai-consent.tsx` is the consent screen required by App Store guideline 5.1.1(i) + 5.1.2(i). Names all four providers (Anthropic, Groq, ElevenLabs, Together AI), lists data sent (voice, transcript, text, files), zero-retention API terms, Continue / Don't allow buttons.

- **Continue** → `setAIConsent()` writes `sharp:ai_consent_v1: 'true'` → routes to `/onboarding/recording`
- **Don't allow** → Alert + routes back to `/onboarding`
- **Retro-gate** in `app/_layout.tsx` OnboardingGate: if `hasOnboarded() && !hasAIConsent()` → redirect to `/onboarding/ai-consent`. Catches:
  - Existing users upgrading from a build before consent existed
  - Restore-on-new-device users who skip onboarding entirely
  - Deep links into AI features

Flag stored in AsyncStorage with `v1` suffix so we can bump if disclosure scope changes.

---

## 6. Tab + route tree

### Tab navigator (`app/(tabs)/`)
| Tab | File | Purpose |
|---|---|---|
| Home | `index.tsx` | Practice mode tiles, streak, usage counters |
| History | `history.tsx` | Past sessions filtered by mode, FlatList with perf flags |
| Settings | `settings.tsx` | Profile, prefs, account (signout + **delete**), plan, legal |

### Modal routes
- `auth/signin` (presented as modal — Apple Sign In + email/password + success state)
- `premium/index` (paywall presented as formSheet)
- `privacy/index` (in-app privacy policy reader)
- `duel/*` (all duel screens are modal)
- `context/setup` (context input modal)

---

## 7. Services (`src/services/`)

| File | Responsibility |
|---|---|
| `api.ts` | HTTP client. `apiPost`, `apiGet`, `apiUpload`. **Handles 204 No Content** + empty body parsing. Attaches Bearer JWT from Supabase session. Default 45s timeout, 60s uploads. |
| `storage.ts` | All AsyncStorage CRUD. Profile, context, sessions, streak, daily history, duels, conversation/thread state, question caches. **AI consent** flag + helpers. **`clearAllUserData()`** for account deletion. Migration race protection (in-progress flag, 3-attempt cap, batched upsert). Triggers cloud sync on writes. |
| `scoring.ts` | Calls `/api/question/generate`, `/api/score`, `/api/threaded/follow-up`, `/api/threaded/debrief`, `/api/progress/summary`. Computes local progress score. |
| `transcription.ts` | Wraps `/api/transcribe` (Groq Whisper). |
| `tts.ts` | Audio playback. Voice modes: `question` / `coaching` / `model` / `followup` / `briefing`. Disk cache, prefetch, cancellation, on-device fallback. Streaming TTFA. |
| `premium.ts` | Tier check, usage tracking, RevenueCat sync. Free vs Premium limits. **Weekly + daily counters**. Per-mode `canDoX` / `trackXUsage`. **`addEntitlementListener`** real-time updates. **`flushPendingUsageSyncs`** retry queue. |
| `revenuecat.ts` | RevenueCat init, identify, entitlement check, offerings, purchase, restore. **`addCustomerInfoUpdateListener`** wires entitlement changes to premium service. |
| `auth.ts` | Apple Sign In + email/password via Supabase. **`deleteAccount()`** = self-healing server delete + local wipe + signOut. |
| `supabase.ts` | Supabase client (or no-op proxy if env not configured). |
| `sync.ts` | Push local AsyncStorage records to Supabase tables; document upload to Supabase Storage. Batched upsert. |
| `analytics.ts` | PostHog wrapper + `Events` constants. |
| `errorTracking.ts` | Sentry stub (init / capture / setUser). |
| `notifications.ts` | Expo push token registration. |
| `prewarm.ts` | Fire-and-forget audio prewarm on app boot (today's Daily Challenge). |
| `seed.ts` | Dev-only seeding helper (untracked). |

---

## 8. Theme & types

**Theme** (`src/constants/theme.ts`) — Soft Dawn light mode:
- Background: `#FAF6F0` (cream), `#FFFFFF` (cards), `#F5F0E8` (inputs)
- Text: `#3A2A1A` primary → `#7A6A5A` secondary → `#A09080` tertiary → `#C0B0A0` muted
- Accent: `#C07050` terracotta, `#FFF5EB` light bg, `#F0DCC8` border
- Success: `#5A9A5A` sage, `#E8F5E8` positive bg
- Error: `#C05050`
- Duel purple: `#8B7EC8`

Responsive helpers: `wp()` (width %), `fp()` (scaled font), `getScoreColor()` (1-10 score → colour).

**Types** (`src/types/index.ts`) — single source of truth. Notable:
- `PlanId` = `'free' | 'monthly' | 'annual'`
- `UsageLimits` = `{ oneShotsPerDay, oneShotsPerWeek, threadedPerDay, ... }` — **weekly cap added** post-pricing review
- `Session.type` = `'daily_30' | 'one_shot' | 'threaded' | 'duel' | 'conversation'`
- `ScoringResult` includes `coachingInsight`, `weakestSnippet { original, problems, rewrite, explanation }`, `modelAnswer`

---

## 9. Backend — Express (`backend/server.js`)

Deployed to Railway. ~1850 lines. ~30 routes.

### Middleware
- `helmet` (CSP off — API only)
- CORS allowlist via `ALLOWED_ORIGINS` env
- `express.json({ limit: '25mb' })`
- Per-route IP rate limits (60s window): `/api/question` 10/min, `/api/score` 10/min, `/api/threaded` 15/min, `/api/transcribe` 10/min, `/api/tts` 20/min, `/api/conversation` 20/min
- `makeVerifyUser(supabase)` JWT middleware on `/api/v2/*` (soft-fails to `req.userId = null`) and `/api/account/*` (hard-fails to 401)

### Models config
```js
const MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  HAIKU: 'claude-haiku-4-5-20251001',
};
```

**Haiku** (10 fast paths): question generation, follow-up v1, quality gate, progress summary, conversation setup/respond, news planning, engagement nudge.

**Sonnet** (6 quality-critical paths): scoring, debrief, conversation debrief, daily-question, document parsing.

### Prompt caching

`callClaude(prompt, maxTokens, { cacheSystem, model })` uses Anthropic's ephemeral cache:
```js
system: [{ type: 'text', text: cacheSystem, cache_control: { type: 'ephemeral' } }]
```

Splits scoring into a **cacheable** `scoringSystemPrompt` (~4000 tokens, principles + frameworks) + a **dynamic** `scoringPrompt` (per-call user context + transcript). ~90% input cost reduction on scoring.

### Routes (selected)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Service availability |
| GET | `/api/config` | Remote feature flags (`features`, `version`) |
| GET | `/api/usage` | Daily token / call counters |
| GET | `/api/daily-question` | Promise-locked: concurrent callers share one Claude call |
| POST | `/api/question/generate` | Personalised question via Haiku |
| POST | `/api/score` | Cached Sonnet scoring |
| POST | `/api/threaded/follow-up` | Haiku follow-up |
| POST | `/api/threaded/debrief` | Sonnet full thread analysis |
| POST | `/api/progress/summary` | Haiku 30s spoken summary |
| POST | `/api/transcribe` | Audio base64 → Groq Whisper → text. **Audio files deleted in `finally{}` block.** |
| POST/GET | `/api/tts` | Together AI Kokoro primary, ElevenLabs fallback. **Singleflight** via `ttsPending` Map. Server-side cache `ttsCache` MD5-keyed on text+voice+provider. Background TTL eviction. |
| POST | `/api/document/extract-text` | PDF/DOCX → raw text |
| POST | `/api/document/parse` | Sonnet classification + structured extraction |
| POST | `/api/webhooks/revenuecat` | Hardened: timing-safe Bearer compare, HMAC eventually, event allowlist, UUID validation |
| POST | `/api/conversation/setup` | Haiku agent persona builder |
| POST | `/api/conversation/signed-url` | Mint short-lived ElevenLabs WS URL |
| POST | `/api/conversation/debrief` | Sonnet conversation analysis |
| POST | `/api/notifications/register` | Expo push token registration |
| POST | `/api/notifications/engagement-check` | Cron: batched DB queries for re-engagement push |
| POST | **`/api/account/delete`** | **NEW.** Bearer-token auth. Calls `supabase.auth.admin.deleteUser`. Cascades all user data via FK. **Idempotent 204** on "already deleted" (handles double-tap + stale token after first attempt). |

### Helpers
- `callClaude(prompt, maxTokens, opts)` — Anthropic call with prompt caching support
- `callClaudeWithTools(...)` — tool-use loop (used by agent paths)
- `sendError(res, status, error, context)` — sanitises in prod, logs server-side
- `streamUpstreamAndCacheBuffer` — pipes chunks to client + collects for cache (TTS)
- `rateLimit(maxPerMin)` — IP-keyed token bucket

### Together AI Kokoro

Primary TTS provider. **CRITICAL**: uses `stream: false` — `stream: true` returns Server-Sent Events with base64 audio deltas, not raw MP3. AVPlayer can't parse SSE → silent failure. Bug took ~5 min of "no audio" before being caught by inspecting bytes with `file` command.

Voice: `am_michael` (clean US male), per-mode speed variation. Voice baked into cache key for invalidation.

### Agent system (`backend/agent/`)

- `runner.js` — `runAgent({ totalBudgetMs: 25_000, perToolTimeoutMs: 3_000, minIterationBudget: 8_000 })`. Per-iteration deadline + per-tool `Promise.race` timeout. AbortController propagated to Anthropic.
- `tools.js` — 7 retrieval tools: `get_recent_sessions`, `get_session_turns`, `search_user_history`, `get_weakest_dimensions`, `find_recurring_pattern`, `get_user_context`, `find_contradiction`. All have `needsDb(ctx)` short-circuit.
- `traces.js` — PostHog server-side + Supabase `agent_traces` table. `createTrace({ supabase, userId, agentName, sessionId })` → `{ requestId, start, recordToolCall, recordTokens, complete }`. `shutdown()` flushes on SIGTERM.
- `auth.js` — `makeVerifyUser(supabase)` reads Bearer, sets `req.userId` via `supabase.auth.getUser(token)`. Soft-fails to null on `/api/v2`, hard-fails to 401 on `/api/account`.
- `threaded_interrogator.js` — agentic threaded follow-up generator with tools.

**Feature flags** (`src/constants/features.ts`):
- `conversation: false` — Conversation feature gated
- `agenticThreaded: false` — agent path off in production until proven
- `agenticScoring: false`
- `agenticDebrief: false`

---

## 10. Backend prompts (`backend/prompts/index.js`)

Key prompts + new `buildUserContextBlock(context)` helper.

`buildUserContextBlock(context)` produces a natural-language narrative (instead of JSON.stringify(...) dumps) used across all prompts:

```
WHO THIS PERSON IS:
  Currently: [role] at [company].
  Aiming for: [dream role].
  Right now: [situation].
THEIR OWN NOTES (treat as direct preferences/instructions):
  [notes]
THEIR UPLOADED DOCUMENTS (reference these specifically when relevant):
  • [type] filename — summary (role · co · skills · achievements · requirements)
THEIR PERFORMANCE (N sessions tracked):
  Overall avg: X/10. Weakest: dim (val). Strongest: dim (val).
RECENT COACHING (what they've already been told): [insights list]
  → Recurring keywords: detection
RECENT SESSIONS (most recent first): [list]
```

Significantly more personalised output. Replaces raw field assembly in: scoringPrompt, followUpPrompt, debriefPrompt, questionEnginePrompt, conversationSetupPrompt, conversationRespondPrompt, conversationDebriefPrompt.

`scoringSystemPrompt` (cacheable, ~4000 tokens) — separate from `scoringPrompt` (dynamic per-call context). Enables prompt caching.

---

## 11. Data model & storage

### AsyncStorage keys (sharp:* prefix)

**User-scoped (cleared on account delete):**
```
sharp:context, sharp:sessions, sharp:session:<id> (many),
sharp:streak, sharp:streak_history, sharp:streak_badges,
sharp:daily_history, sharp:daily_last_date,
sharp:duels, sharp:feature_interest,
sharp:user_profile, sharp:premium_status,
sharp:daily_usage, sharp:pending_usage_sync,
sharp:active_conversation, sharp:active_thread,
sharp:oneshot_question_cache, sharp:threaded_question_cache,
sharp:industry_question_cache, sharp:recent_questions,
sharp:summary_cache, sharp:daily_question_cache,
sharp:pref_audio, sharp:pref_haptics,
sharp:onboarded, sharp:onboarding_step,
sharp:ai_consent_v1,
sharp:cloud_migrated, sharp:cloud_migration_inprogress, sharp:cloud_migration_attempts
```

`clearAllUserData()` in `storage.ts` uses `AsyncStorage.multiRemove([...explicit list, ...session:* keys from getAllKeys filter])` — explicit list avoids clobbering non-sharp keys.

### Supabase tables (mirrored from local)

`profiles`, `user_context`, `sessions`, `turns`, `streaks`, `badges`, `daily_results`, `documents` (+ Storage bucket), `usage`, `agent_traces`. All cascade-delete on `auth.users` via FK.

### Migration race protection

`runMigrationIfNeeded()` in `storage.ts`:
- `MIGRATION_IN_PROGRESS_KEY` set at start → concurrent calls bail
- `MIGRATION_ATTEMPTS_KEY` capped at 3 attempts before giving up
- `migrateLocalToCloud()` in `sync.ts` uses **batched** upsert (idempotent on PK) — sessions+turns separately, badges, daily_results
- `Promise.allSettled` for error tolerance

---

## 12. Data flow — key operations

### Daily 30
1. Mount → `getCachedDailyQuestion()` (one shared question per UTC day)
2. Cache miss → `GET /api/daily-question` (server-side Promise-lock → Sonnet → cache server-side)
3. `prefetchAudio()` warms TTS cache via Kokoro
4. User records (60s) → expo-audio writes file URI
5. Stop → `POST /api/transcribe` → Groq Whisper
6. Validate (≥5 words) → `POST /api/score` → cached Sonnet → coaching insight
7. `updateStreak()` + `clearDailyQuestionCache()` + `saveSession()` via `Promise.allSettled`
8. Navigate to `/daily/result`

### One Shot
Same pipeline, 90s, full coaching + snippet rewrite + model answer. Pro 3/day or Free 3/week (`canDoOneShot` enforces weekly cap).

### Threaded
Up to 4 turns. After each: `POST /api/threaded/follow-up` → Haiku → next question. After turn 4: `POST /api/threaded/debrief` → Sonnet → full thread analysis. **Thread recovery**: if user backgrounds + AsyncStorage drops the thread, "Your thread expired" recovery screen instead of generic error.

### Sharp Duels
P1 records Daily 30 → `saveDuel()` with shareToken. P2 opens link → `/duel/accept` → records same day's question. Both transcripts scored independently → `/duel/results` side-by-side. **Always free** (viral mechanic, must not be paywalled).

### Account deletion (5.1.1(v))
1. Settings → Account → Delete account
2. Alert 1: explains permanence + subscription cancellation warning
3. Alert 2: type-`DELETE` confirmation (Alert.prompt, iOS-only)
4. `deleteAccount()` in `auth.ts`:
   - `apiPost('/account/delete')` → backend calls `supabase.auth.admin.deleteUser(req.userId)` → cascades through all FK'd tables
   - `clearAllUserData()` → `AsyncStorage.multiRemove([...])`
   - `supabase.auth.signOut()` → AuthContext SIGNED_OUT handler fires → RevenueCat `logoutUser()` automatic
5. Redirect to `/onboarding`

**Self-healing**: only HTTP-level errors abort. Empty body / parse hiccups don't strand the user. Idempotent backend handles stale token (Bearer present but user already deleted → 204).

---

## 13. Caching, timeouts & limits

| Layer | Behaviour |
|---|---|
| Daily question | One per day shared globally, server-cached + client AsyncStorage |
| TTS audio | Server-side MD5 cache (text + voice + provider) with 1h TTL + background eviction every 10 min; client-side disk cache via `expo-file-system`; prefetched on screen mount |
| Anthropic prompt cache | Ephemeral 5-min TTL on system prompt block (~4000 tokens cached) |
| Client fetch | 45s timeout, 60s uploads |
| Server Claude call | 30s abort + agent runner 25s total + 3s per tool |
| Backend rate limits | Per-IP, see §9 |
| `Purchases.addCustomerInfoUpdateListener` | Real-time premium refresh on entitlement change |

---

## 14. Auth & sync

- **Apple Sign In** primary (`expo-apple-authentication`). Uses Sign in with Apple → Supabase `signInWithIdToken({ provider: 'apple', token })`.
- **Email/password** fallback for testing.
- Supabase JWT stored via AsyncStorage adapter.
- `AuthContext` (`src/context/AuthContext.tsx`) listens to `onAuthStateChange`; calls `logoutUser()` (RevenueCat) on SIGNED_OUT.
- **Local-first**: every screen reads AsyncStorage. After every successful local write, `sync.ts` cloud-writes (fire-and-forget).
- `migrateLocalToCloud()` runs once after first sign-in to backfill.

---

## 15. Privacy posture (compliance + Apple 5.1.1(i))

**What we send to third parties:**
- Voice audio → Groq (transcription, deleted immediately after)
- Transcript + context → Anthropic (scoring + coaching)
- Question text → ElevenLabs / Together AI (TTS)
- Documents → Anthropic (parsing)

**What we don't do:**
- No audio stored on Sharp servers (deleted in `finally{}` block)
- No selling user data
- No training on user data
- All providers under zero-retention API terms

**In-app disclosure:**
- Consent screen before first AI call (gated retro-actively)
- Tappable Privacy Policy + Terms of Use on paywall + Settings
- Privacy Policy at `app/privacy/index.tsx` has dedicated "AI Processing & Consent" section
- Hosted policy at speaksharpai.com

**Account deletion:**
- In-app, single screen, two-step confirmation
- Cascade delete via Supabase FK
- Local AsyncStorage wipe
- Subscription cancellation guidance in confirmation copy (must cancel separately via Apple ID)

---

## 16. Build & release

### EAS profiles (`eas.json`)
- `development` — internal distribution, dev client enabled
- `preview` — internal Ad Hoc, real device install via QR
- `production` — App Store distribution, auto-increment build number, `ascAppId: 6761378418`, `appleTeamId: 9HQYKH65D3`

### App.config.ts
- Bundle ID `com.sharp.ai`, version `2.0.0`, runtime version `2.0.0`
- `usesAppleSignIn: true`, mic permission, privacy manifest
- New Architecture enabled
- Updates URL: `https://u.expo.dev/12e05e54-293d-47be-8857-4ad2a55926ff`

### OTA (EAS Update)
- Branch: `feature/conversational-ai`
- Runtime version `2.0.0` — must match build's baked runtime
- Any build with matching runtime pulls OTA on launch, applies on **next** launch
- Reviewer + production users get JS-only updates without going through App Review

### Production deploy flow
```bash
# Frontend (any commit on feature/conversational-ai)
eas build --platform ios --profile production --auto-submit --non-interactive --no-wait
# → builds release IPA on EAS (~20 min)
# → auto-submits to App Store Connect (~1 min)
# → Apple processes (~10-30 min)
# → appears in TestFlight + ready for App Review submission

# OTA for JS-only changes between builds
eas update --branch feature/conversational-ai --message "..." --non-interactive

# Backend (any commit affecting backend/)
cd backend && railway up --detach
# → uploads + builds + deploys on Railway (~2-3 min)
```

---

## 17. App Store review state (2026-05-14)

**Initial rejection (build #6, May 12)** — 4 guideline violations:
1. **3.1.2(c) EULA** — no Terms of Use link in metadata or in-app
2. **5.1.1(i) + 5.1.2(i)** — no AI data sharing disclosure / consent
3. **3.1.2(c) pricing** — per-month "£12.50/mo" rendered larger than billed "£149.99"
4. **5.1.1(v)** — no in-app account deletion

**All four fixed**:
- EULA link in App Description + in-app on paywall + Settings (Apple stdeula URL)
- AI consent screen at `app/onboarding/ai-consent.tsx` + retro-gate
- Pricing flip: billed amount now largest+boldest, per-month subordinate
- Settings → Account → Delete account with two-step confirm + cascade delete

**Build #9** in EAS Submit queue → resubmit + 90s screen recording reply.

---

## 18. Pending / loose ends

| Item | File / area | Note |
|---|---|---|
| Conversation feature | `app/conversation/*` | Gated by `FEATURES.conversation: false`. Re-enable post-launch. |
| Realtime Coaching prototype | `app/realtime-coaching/` | Untracked WIP, not shipping in v1 |
| `interview_pack` (£29.99) | `app/premium/interview-pack.tsx` | "Coming soon" alert — wire to RevenueCat non-consumable when ready |
| `conversation_3_pack` / `conversation_10_pack` IAP | `app/conversation/purchase.tsx` | Dead code, ts-nocheck; re-enable when conversation ships |
| Python `ai-service` | `backend/ai-service/` | Stood up but no client calls it; integration is post-launch |
| Pre-generated question pool | Backend | Batch-generate to DB → cuts Claude costs ~40% at scale |
| Pro+ tier (£29.99) | Future | Add when v1 has signal; gates voice analysis features |
| App Store screenshots | `screenshots/final/` | Generated via dev/screenshots.tsx; uploaded to App Store Connect |

---

## 19. Where to look when debugging

| Symptom | Look here |
|---|---|
| Scoring fails on device | `app/daily/challenge.tsx` `stopRecording()` catch; dev logs in __DEV__ |
| Scoring fails on server | Railway logs, search `Scoring:` (set by `sendError`) |
| Invalid Claude JSON | `backend/server.js` — "Failed to parse Claude response" log |
| TTS silent / SSE error | `backend/server.js:~1290` — confirm `stream: false` for Kokoro |
| TTS no audio at all | `src/services/tts.ts` falls back to `expo-speech` if all providers fail |
| Premium gate wrong | `src/services/premium.ts` — `canDoX` + RC entitlement; check entitlement listener fired |
| Daily question repeats | `getCachedDailyQuestion()` + `getRecentQuestions()` variety guard |
| Conversation won't connect | `/api/conversation/signed-url` token mint + WebView in `assets/conversation.html` |
| Account delete JSON parse | `src/services/api.ts` — must handle 204 No Content + empty body |
| Account delete 401 after first attempt | Backend `/api/account/delete` returns 204 for stale Bearer (user already deleted) |
| OTA not applying | Force-quit app twice — Expo Updates applies on 2nd launch after fetch |

---

## 20. Recent change log (since v2.0 main snapshot)

**Pre-launch hardening sweep**:
- `508d598` perf+fix(backend): TTS singleflight, daily-question lock, batched push checks, agent timeouts, RC webhook hardening
- `53a57f5` fix+perf(client): RC entitlement listener, migration atomicity, batched storage reads, deferred RC sync, usage retry queue
- `328736b` fix+perf(ui): thread recovery, save error handling, recording double-start, batched home load, FlatList flags
- `15e749b` hotfix(tts): restore streaming TTFA + drop abort-on-close
- `9551fc8` fix(tts): Kokoro stream:false — Together returns SSE not MP3 in stream mode
- `9684bcf` feat(tts): switch Kokoro voice to am_michael
- `e44e6b3` perf+quality(api): Haiku swap for fast paths + rich user context block
- `879d3d6` feat(pricing): tighter free tier (3 One Shots/week), harder paywall, £-based annual framing

**App Store rejection fixes**:
- `b475328` fix(paywall): flip pricing hierarchy + Privacy/Terms links
- `f99eedb` feat(consent): one-time AI provider disclosure before any third-party call
- `83c497f` feat(account): in-app account deletion with cascade + local wipe
- `77b53b2` ux(consent): soften AI disclosure to single paragraph
- `2c893fe` ux(auth): polish sign-in success + confirm screens
- `5ef000b` fix(account): handle 204 No Content + self-healing deleteAccount
- `0e1817b` fix(account): treat stale token as already-deleted (idempotent 204)
