# Sharp AI — Cloud Migration & Growth Architecture Plan

> **Created:** 2026-03-25
> **Status:** Design phase — pending review before implementation

---

## Executive Summary

Sharp is currently fully local (AsyncStorage, no auth, dev-flag premium). This plan covers the transformation to a production-ready cloud app with authentication, real subscriptions, onboarding, and offline-first sync. Each phase delivers standalone value.

---

## 1. Authentication — Supabase Auth

### Why Supabase

| Provider | Verdict |
|----------|---------|
| **Supabase Auth** | **Winner** — auth + Postgres + storage in one platform. Free 50K MAU. Apple/Google SSO. RLS ties to user ID. |
| Firebase Auth | Firestore is NoSQL — poor for relational session data. Two systems to manage. |
| Clerk | $0.02/MAU past 10K — too expensive for consumer app. |
| Custom JWT | Months of work, security liability. |

### Auth Methods
1. **Apple Sign In** (required for App Store)
2. **Google Sign In** (largest Android base)
3. **Email + Password** (fallback)

### Anonymous-to-Authenticated Migration

**Strategy: Supabase Anonymous Auth**

1. First app open → auto-create anonymous Supabase user (invisible to user)
2. All data written under this anonymous user ID
3. When user signs up → anonymous account "upgraded" — same UUID, data preserved
4. If reinstall without signing up → anonymous data lost (acceptable — low investment)

### Token Architecture
- Supabase handles JWTs automatically (1hr access + refresh)
- Tokens stored in AsyncStorage via custom adapter
- Backend validates JWT using Supabase JWT secret (no network call)
- `api.ts` attaches `Authorization: Bearer <token>` to every request

### New Files
- `src/services/supabase.ts` — client init with AsyncStorage adapter
- `src/services/auth.ts` — signUp, signIn, signOut, Apple/Google SSO
- `src/context/AuthContext.tsx` — React context with `useAuth()` hook

### New Packages
- `@supabase/supabase-js`
- `expo-apple-authentication`
- `expo-auth-session` + `expo-crypto`

---

## 2. Onboarding Flow — Value Before Commitment

### Core Principle
Users complete their first Daily Challenge and see scores BEFORE being asked to sign up. The "aha moment" is the score breakdown + coaching insight.

### Screen Sequence

**Phase A: Zero-Friction Entry (no sign-up)**

| # | Screen | Collects |
|---|--------|----------|
| 1 | Welcome — logo + "Start your first challenge" | Nothing |
| 2 | Daily Challenge — standard flow | Recording |
| 3 | Results — full score reveal | Scores (stored under anon user) |

**Phase B: Soft Sign-Up Gate (after first result)**

| # | Screen | Collects |
|---|--------|----------|
| 4 | "Save your progress" — Apple/Google/Email or "Maybe later" | Auth or skip |
| 5 | "What should we call you?" — name field | Display name |
| 6 | "What brings you here?" — tappable cards (Interviews, Presentations, Leadership, Difficult conversations, Confidence) | Goals |
| 7 | Quick context (optional) — Role + Company | Context |

### Skip Handling
- Remain on anonymous account
- Subtle home banner: "Save your progress — sign up" (dismissible, returns weekly)
- After 3rd session: stronger prompt about improving scores
- After 7th session (1-week streak): "Protect your streak" prompt
- Never block core features for sign-up

### Re-Engagement Hooks
- **Daily reminder** push notification (user-chosen time)
- **"Streak at risk"** push at 8 PM if no session
- **Weekly improvement** push: "Your structure improved 1.2 points this week"
- **Badge unlock** push
- **Welcome back** card on home if 2+ days inactive

### New Screens
```
app/onboarding/
  welcome.tsx
  save-progress.tsx
  your-name.tsx
  your-goals.tsx
  quick-context.tsx
```

---

## 3. Cloud Database — Supabase Postgres

### Schema (Key Tables)

```sql
profiles          — id, display_name, avatar_url, goals[], onboarding_complete
user_context      — user_id, role_text, current_company, situation_text, dream_role
documents         — user_id, filename, raw_text, structured_extraction (JSONB), type
sessions          — user_id, type, scenario, created_at
turns             — session_id, user_id, turn_number, question, transcript, recording_url,
                    model_answer, scores (JSONB), overall, summary, coaching_insight,
                    positives, improvements, communication_tip, suggested_angles[],
                    filler_words_found[], filler_count, snippet (JSONB)
streaks           — user_id, current_streak, longest_streak, last_session_date,
                    freezes_used[], freezes_available
streak_history    — user_id, practice_date, was_frozen
badges            — user_id, badge_day, unlocked_at
daily_results     — user_id, score, insight, transcript, practice_date
duels             — creator_id, opponent_id, question, scores, share_token, status
usage             — user_id, usage_date, one_shots, threaded, practice_again
subscriptions     — user_id, plan_id, status, store, expires_at
question_cache    — user_id, cache_date, question_data (JSONB)
recent_questions  — user_id, question_text, created_at
```

All tables have **Row Level Security**: `user_id = auth.uid()`.

### Offline-First Sync Strategy

1. **Write path:** AsyncStorage first (instant), then queue sync operation
2. **Read path:** Always from AsyncStorage (fast). Background pull from Supabase on launch + every 5 min
3. **Conflict resolution:** Last-write-wins by `updated_at` timestamp. Sessions are append-only (no conflicts).
4. **Network detection:** `@react-native-community/netinfo` — flush queue on reconnect

### What Stays Local-Only
- TTS audio cache (re-downloadable)
- Daily question cache (re-fetchable)
- UI preferences

### Migration (AsyncStorage → Cloud)
- One-time on first authenticated session
- Read all local data → upload to cloud under user ID
- If cloud has data (existing user, new device) → merge (union sessions, max streak, merge badges)
- Show progress indicator: "Syncing your sessions..."
- Mark complete: `sharp:migration_complete = true`

---

## 4. Premium — RevenueCat

### Why RevenueCat
- Handles App Store + Play Store with one SDK
- Server-side webhook for receipt validation
- Free up to $2,500 MTR
- Handles trials, grace periods, billing retry automatically

### Integration
- **Frontend:** `react-native-purchases` — identify user, check entitlements, purchase packages
- **Backend:** Webhook endpoint → updates `subscriptions` table
- **Premium check:** `Purchases.getCustomerInfo()` → check `pro` entitlement (replaces dev flag)
- **Cross-device:** `Purchases.logIn(userId)` restores subscription on new device

### Products
- `sharp_pass_30` — €19.99, non-renewing, 30 days
- `sharp_monthly` — €12.99/mo, auto-renewable
- `sharp_annual` — €95.88/yr (€7.99/mo), auto-renewable, recommended
- `sharp_three_year` — €215.64/3yr (€5.99/mo), auto-renewable

### Trial
- 7-day free trial on Monthly and Annual plans
- Configured in App Store Connect / Play Console

---

## 5. Server-Side Context Resolution

### Current Problem
Every API call passes full user context (role, company, docs) in request body — wasteful, insecure.

### Solution
Backend resolves context from database using authenticated user ID:

1. Frontend sends: `{ question, transcript }` only
2. Backend extracts `userId` from JWT
3. Backend queries `user_context` + `documents` + recent turns
4. Backend builds prompt with server-side context
5. No context travels over the wire

### New Backend Module
`backend/services/context.js` — fetches and assembles user context from DB for prompt building.

---

## 6. Recording Storage — Supabase Storage

### Flow
1. Record → local temp file (as today)
2. Send to backend for transcription (as today)
3. AFTER transcription → background upload to Supabase Storage
4. Store URL in `turns.recording_url`
5. Playback via signed URLs (1-hour expiry)

### Storage
- Bucket: `recordings` (private, RLS)
- Path: `{userId}/{sessionId}/{turnId}.mp3`
- Retention: 90 days free users, unlimited pro

### Cost Estimates (per 1K active users)
- Average recording: ~480KB (60s MP3 at 64kbps)
- Monthly per user: ~21MB
- 1K users: ~21GB storage → ~$0.50/mo
- 10K users: ~210GB → ~$5/mo

---

## 7. New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/auth/profile` | POST | Create/update profile |
| `GET /api/auth/profile` | GET | Get profile + context |
| `POST /api/sessions` | POST | Save session |
| `GET /api/sessions` | GET | List sessions (paginated) |
| `GET /api/sessions/:id` | GET | Full session with turns |
| `GET /api/streak` | GET | Get streak data |
| `POST /api/streak/update` | POST | Update streak |
| `POST /api/recordings/upload` | POST | Upload recording |
| `GET /api/recordings/:path` | GET | Signed URL for playback |
| `POST /api/context` | POST | Save context |
| `POST /api/documents` | POST | Upload + parse document |
| `POST /api/webhooks/revenuecat` | POST | Subscription webhook |
| `GET /api/subscription/status` | GET | Check premium |
| `POST /api/sync/push` | POST | Bulk push local → cloud |
| `POST /api/sync/pull` | POST | Bulk pull cloud → local |

All existing endpoints get auth middleware + server-side context resolution.

---

## 8. Implementation Order

| Phase | Scope | Duration | Deliverable |
|-------|-------|----------|-------------|
| **1** | Auth + Onboarding | 2-3 weeks | Users can sign up/in. Anonymous auto-created. Onboarding flow. Still uses AsyncStorage. |
| **2** | Database + Migration | 2-3 weeks | Data syncs to cloud. Offline works. New device gets all data. |
| **3** | Server-Side Context | 1 week | API calls simplified. Context lives server-side. |
| **4** | RevenueCat | 1-2 weeks | Real in-app purchases. Subscriptions sync across devices. |
| **5** | Recording Storage | 1 week | Recordings persist across reinstalls. Cloud playback. |
| **6** | Push Notifications | 1 week | Daily reminders, streak protection, progress nudges. |

**Total: ~8-11 weeks**

---

## 9. Monthly Cost Estimates

| Service | 1K Users | 10K Users |
|---------|----------|-----------|
| Supabase Pro | $25 | $25 + usage |
| Supabase Storage | ~$0.50 | ~$5 |
| RevenueCat | Free | 1% of MTR |
| Claude API | $150-300 | $1,500-3,000 |
| Groq (Whisper) | ~$20 | ~$200 |
| ElevenLabs | $22 | $99 |
| **Total** | **~$250-400** | **~$2,000-3,500** |

Claude API is the largest cost. Mitigation: prompt caching, daily question sharing, question caching.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Anonymous→auth migration loses data | Keep AsyncStorage backup 30 days post-migration |
| Offline sync conflicts | Append-only sessions (no edits). Last-write-wins for profile/context. |
| Apple rejects without Apple Sign In | Implement Apple Sign In first |
| Recording storage costs at scale | 90-day retention for free. 32kbps compression. |
| Claude API costs at scale | Prompt caching. Shared daily questions. Rate limiting. |
| Supabase outage | Offline-first design means app works without Supabase |

---

## 11. Security

1. RLS on every Supabase table — users access only their own data
2. JWT validation on every backend endpoint
3. Signed URLs for recordings (1-hour expiry)
4. Rate limiting (`express-rate-limit`, 100 req/min/user)
5. API keys server-side only (never in frontend bundle)
6. Supabase anon key (limited by RLS) on frontend, service key on backend
7. Input validation (`zod`) on all request bodies
8. CORS restriction in production
9. Premium status checked server-side from `subscriptions` table, never trusted from client
