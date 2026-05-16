# Sharp AI — Onboarding & App Context

> Brief for an agent improving onboarding for capture + retention. Everything below reflects the live codebase as of build #13 (15 May 2026). Read top to bottom — sections are ordered by what you need to understand the problem space before recommending changes.

---

## 1. The product in one paragraph

Sharp is a React Native / Expo iOS app that trains professionals to speak clearly, concisely, and with substance under pressure. The user speaks a 30–90 second answer to a question, Claude scores it across 5 dimensions, and the user gets coaching grounded in 8 communication frameworks (without ever naming the books). It's a "drill ground between coaching sessions" — not a content library. Pricing is **£19.99/mo** or **£149.99/yr** (annual = £12.50/mo equivalent) with a **7-day free trial**. Free tier keeps Daily Challenge + 3 One Shots/week. Pro unlocks full coaching, Threaded (4-turn pressure rounds), Industry mode, model answers, and the Progress dashboard.

**Target users** (validated by audit + product testing):
- **Interview Sprinters** (4-12 weeks of intensive prep, high willingness-to-pay, churns after)
- **Non-native English professionals in senior roles** (sustained pain, highest LTV — currently underserved by ESL apps that focus on pronunciation)
- **Founders prepping for fundraising** (small market, bursty usage, very high spend per burst)

**Mirages to avoid building for** (low conversion, drift fast):
- Generic "career-plateau mid-manager who wants to improve communication"
- B2B without a full product fork

---

## 2. Current onboarding flow

11 screens. File names map 1:1 to `app/onboarding/*.tsx`. The OnboardingGate at `app/_layout.tsx:63` redirects any not-onboarded user back to `/onboarding/index`. The flag flips in `welcome.tsx` via `setOnboarded()`.

### Step-by-step flow

```
index → name → signin → ai-consent → challenge-intro → recording → result → value → upcoming → paywall → welcome → /(tabs)
```

| # | Screen | Purpose | Required? | Analytics fired |
|---|---|---|---|---|
| 1 | `index.tsx` | Hook + value prop ("Your words are your superpower") | Optional skip | `ONBOARDING_STARTED` |
| 2 | `name.tsx` | First-name capture (TextInput) | Yes (button disabled until filled) | — |
| 3 | `signin.tsx` | Apple Sign In primary, email/password fallback. **Has explicit "Skip for now" link** | Optional skip | — |
| 4 | `ai-consent.tsx` | GDPR/Apple-required consent for sending voice/text to Anthropic, Groq, ElevenLabs, Together AI | **Hard required** — "Don't allow" routes back to /onboarding | — |
| 5 | `challenge-intro.tsx` | Sets up the recording challenge ("Tell me about yourself") | Pass-through | — |
| 6 | `recording.tsx` | 30s recording → Groq Whisper → Claude scoring (calibrated to 4.5-6.5 honest range) | Yes (≥5 words required, retry on short) | — |
| 7 | `result.tsx` | Score reveal with 5 dimension bars + first coaching insight + Sharp voice playback | Pass-through | — |
| 8 | `value.tsx` | "One habit. Five minutes. Everything changes." — feature cards for Daily/One Shot/Pressure Rounds | Optional skip ("Continue with free plan" → straight to /welcome) | — |
| 9 | `upcoming.tsx` ⭐ NEW | "What's the conversation you're prepping for?" — 9 event-type chips + 6 when chips + optional 1-sentence description | Optional skip ("I don't have one right now") | `upcoming_event_created` / `upcoming_event_skipped` |
| 10 | `paywall.tsx` | Trial-first hard paywall with feature comparison table, annual recommended (Save £90 badge), monthly secondary | Optional skip (demoted "Continue with limited free plan" link) | — |
| 11 | `welcome.tsx` | "You're in" — 3-step game plan card (Daily / One Shot / Build streak) | Pass-through | `ONBOARDING_COMPLETED` |

### Visual design pattern across onboarding
- Soft Dawn palette: cream `#FAF6F0` bg, terracotta `#C07050` accents, sage green `#5A9A5A` success
- `SharpFox` mascot (different expressions: happy / listening / thinking / celebrating)
- `SpeechBubble` for character dialogue
- `ProgressDots` showing 5 dots (uses `current` 0–4 across name/signin/challenge-intro/recording/result)
- `FadeIn` animations staggered with delays
- All headings: `fontSize: fp(28-34), fontWeight: black, letterSpacing: -0.5 to -1.2`

---

## 3. What each screen actually says (copy)

### `index.tsx` (Hook)
- **Greeting bubble**: "The best communicators aren't born. They practice. I'll show you how in 30 seconds."
- **Headline**: "Your words / are your / superpower."
- **Sub**: "Interviews. Pitches. Tough conversations. Sharp trains you to nail them all with AI that listens, scores, and coaches you in real time."
- **Proof row**: "30s per day · 5 dimensions · AI coach"
- **CTA**: "Find out how sharp you are" → button
- **CTA sub**: "Free. 30 seconds. No card needed."

### `name.tsx`
- **Greeting bubble**: "First things first. What's your name?" → updates to "Nice to meet you, [name]! 👋"
- **Input**: "Your first name" (autofocus, maxLength 30)
- **CTA**: "Continue →" (disabled until trimmed name present)

### `signin.tsx`
- **Title**: "Create account" / "Welcome back" (toggle)
- **Sub**: "Save your sessions, scores, and streaks across devices."
- **Primary**: "Continue with Apple" (when available)
- **Or**: divider, then email + password form
- **Switch**: "Already have an account? Sign in" / vice versa
- **Skip**: "Skip for now" (link, mid-page bottom)
- **Email confirmation state** (if `signUpWithEmail` returns no session): "Check your email. We sent a link to [email]. Tap it to verify, then come back." → "I've confirmed, sign in" button

### `ai-consent.tsx` (the gate)
- **Eyebrow**: "Permission required"
- **Title**: "Allow Sharp to share your voice and text with AI providers?"
- **What is sent**: "Your voice recordings, the transcripts of those recordings, and any text or files you choose to upload (such as a CV or job description)."
- **Who it is sent to**: Anthropic (scoring + coaching), Groq (transcription), ElevenLabs + Together AI (TTS)
- **How it is protected**: Zero-retention API terms. Audio deleted from Sharp servers immediately after transcription.
- **CTAs**: "Allow" (terracotta) / "Don't allow" (returns to `/onboarding` — soft block)
- **Footnote**: "You can revoke this at any time by deleting your account in Settings."

### `challenge-intro.tsx`
- **Bubble**: "Let's see what you've got. Answer one question and I'll score you across 5 dimensions instantly."
- **Question card**: "Tell me about yourself, who you are and what you do."
- **Context line**: "This is the most common question in interviews, meetings, and networking. Most people fumble it."
- **Meta**: "30s to speak · 5 scores · AI feedback"
- **CTA**: "Start speaking"
- **Hint**: "Speak naturally, there are no wrong answers"

### `recording.tsx`
- **Question fixed**: "Tell me about yourself, who you are and what you do."
- **Timer**: 30 seconds, starts at "0:30", red when active
- **Mic permission flow**: if denied, shows "Microphone permission denied. Please enable it in Settings to use Sharp."
- **Retry guard**: if transcript <5 words, "That was a bit quick! Give yourself the full 30 seconds, there's no pressure."
- **Processing**: `LoadingScreen` with "Sharp is listening... Analysing your communication style"
- **Saves** a Session of type `'one_shot'` with `scenario: 'First impression'` (will show up in History)

### `result.tsx`
- **Eyebrow**: "YOUR FIRST SHARP SCORE"
- **Score ring**: animated `ScoreReveal` (sized to score, color graded)
- **Score context** (varies by score):
  - 7+: "You're a natural communicator. Imagine what daily practice could do."
  - 5-7: "Solid start. Most people score here, but the ones who train daily don't stay here."
  - <5: "Every sharp speaker started right where you are. The difference is what happens next."
- **Dimensions card**: 5 rows (Structure / Concision / Substance / Filler Words / Awareness) with score bars
- **Positives card**: ✅ "What you did well" + AI-generated specific positive feedback
- **Insight card**: 💡 "Your first coaching insight" + AI-generated single most actionable insight (also spoken aloud via `playCoachingAudio`)
- **Improvement card** (subtle): AI-generated specific thing to work on
- **CTA**: "See what's next →"
- **Onboarding scoring prompt is specially calibrated** — explicit instruction "most people land 4.5-6.5 on their first try. Don't inflate. Never score below 3.5 overall. But don't hand out 7s either — they haven't earned them yet."

### `value.tsx`
- **Bubble** (Sharp Fox happy): "That was just a taste. People who train with Sharp for 7 days see their scores jump 20-40%. Ready?"
- **Headline**: "One habit. / Five minutes. / Everything changes."
- **Sub**: "The best speakers aren't talented. They're trained. Sharp gives you the reps and the feedback to get there."
- **Feature cards** (chip-coded Free vs Pro):
  - ☀️ Daily Challenge — Free
  - ⚡ One Shot — Free (1/day)
  - ⚓ Pressure Rounds (Threaded) — Pro
  - (💬 Live Conversations card hidden — gated behind `FEATURES.conversation = false`)
- **Dimensions card**: "Scored on 5 dimensions. Every time." — Structure, Concision, Substance, Filler Words, Awareness as chips
- **Primary CTA**: "Start 7-Day Free Trial" → `/onboarding/upcoming`
- **Skip**: "Continue with free plan" → `/onboarding/welcome` (BYPASSES paywall + upcoming)

### `upcoming.tsx` (NEW — 15 May 2026)
- **Eyebrow**: "One last thing"
- **Heading**: "What's the conversation / you're prepping for?"
- **Sub**: "The one that actually matters in the next 90 days. We'll shape every practice session around it."
- **Section 1 — What kind?**: 9 chips
  - 💼 Job interview
  - 🚀 Pitch / investor
  - 💰 Asking for a raise
  - 📋 Performance review
  - 🎯 Tough feedback
  - 🤝 Sales / client
  - 🎤 Presentation / talk
  - 💬 Difficult conversation
  - ✨ Something else
- **Section 2 — When?**: 6 quick-pick chips (This week / Next week / In 2 weeks / In 1 month / In 2 months / In 3 months) — auto-computes ISO date offset
- **Section 3 — Anything specific?**: free-text 1-line description, max 200 chars, placeholder `e.g. "Series A pitch to a16z, B2B SaaS"`
- **CTA**: "Save & continue" (disabled until type+when both selected)
- **Skip**: "I don't have one right now"
- **Saves** `UpcomingEvent` to AsyncStorage. Backend `buildUserContextBlock` injects this into every scenario prompt: *"WHAT THEY'RE PREPARING FOR (bias every scenario toward the SOONEST event when relevant): • Investor pitch — 12 days away. Specifics: Series A to a16z. → Generate scenarios that simulate THIS specific situation."*

### `paywall.tsx`
- **Hero**: 👑 "Sharp Pro" / "Get sharper, faster." / "7 DAYS FREE · CANCEL ANYTIME" pill
- **Comparison table** (Feature / Free / Pro):
  - Daily Challenge — No scoring / Full coaching
  - One Shot sessions — 3/week / 3/day
  - Threaded practice — — / 2/day
  - Industry questions — — / 2/day
  - Context & documents — — / ✓
  - Model answers — — / ✓
- **Annual plan card** (recommended, terracotta border, "Most Popular" badge, "Save £90" green chip): "Annual · £149.99/yr · £12.50/mo equivalent · billed yearly after trial"
- **Monthly plan card**: "Monthly · £19.99/mo · billed monthly after trial"
- **Primary CTA**: "Start 7-Day Free Trial" / "Then [price] · Cancel anytime"
- **Restore purchases** link
- **Demoted skip** ("Continue with limited free plan" — small, underlined, muted color, intentionally less prominent per 2026 research that hard paywalls produce ~5x higher D35 conversion)
- **Legal**: Privacy Policy + Terms of Use links, full Apple disclosure copy below

### `welcome.tsx`
- **Heading**: "You're in, [name]." OR "You're Sharp Pro!" (if subscribed)
- **Sub** (varies):
  - Pro: "Full access unlocked. Deep practice, pressure rounds, and full coaching. It all starts now."
  - Free: "Your first Daily Challenge is ready. Show up every day, speak for 30 seconds, and watch yourself get sharper."
- **Game plan card** (3 numbered steps):
  1. Do the Daily Challenge — "60 seconds a day — the question is free for everyone"
  2. Try your free One Shot — "You get 1 full scored session per day — see how you compare"
  3. Build your streak — "Consistency beats intensity every time"
- **CTA**: "Start training" → flips `setOnboarded()` and routes to `/(tabs)`

---

## 4. Analytics events currently tracked

Defined in `src/services/analytics.ts:40-87`. Wraps PostHog.

- `APP_OPENED` (fired by OnboardingGate)
- `ONBOARDING_STARTED` (fired by `index.tsx` mount)
- `ONBOARDING_COMPLETED` (fired by `welcome.tsx` mount)
- `SESSION_STARTED` / `SESSION_COMPLETED` (post-onboarding)
- `QUESTION_GENERATED` / `QUESTION_REGENERATED`
- `RECORDING_STARTED` / `RECORDING_COMPLETED` / `RECORDING_FAILED`
- `DAILY_CHALLENGE_STARTED` / `DAILY_CHALLENGE_COMPLETED`
- `THREADED_STARTED` / `THREADED_COMPLETED`
- `INDUSTRY_QUESTION_VIEWED`
- `PAYWALL_VIEWED` / `PURCHASE_STARTED` / `PURCHASE_COMPLETED`
- `CONTEXT_SETUP_COMPLETED` / `DOCUMENT_UPLOADED`
- `STREAK_UPDATED` / `BADGE_UNLOCKED` / `MODEL_ANSWER_LISTENED`
- `upcoming_event_created` (custom, source: 'onboarding' | 'in_app')
- `upcoming_event_skipped` (custom)
- `upcoming_event_save_failed` / `upcoming_event_save_skipped` (defensive)

**GAP**: No per-screen funnel events between ONBOARDING_STARTED and ONBOARDING_COMPLETED. Can't measure drop-off at name, signin, ai-consent, recording, result, value, upcoming, or paywall individually. This is the **first analytics fix** any improvement project should make.

**GAP**: `PAYWALL_VIEWED` is in the Events const but **not fired by `app/onboarding/paywall.tsx` mount**. Funnel is missing the paywall view event. Same for the in-app `app/premium/index.tsx` paywall.

**GAP**: Purchase analytics fire on `app/premium/index.tsx:95` (with plan + price) but NOT on `app/onboarding/paywall.tsx` post-purchase — funnel attribution incomplete.

---

## 5. What happens after onboarding (Home screen)

Once `setOnboarded()` fires, user lands on `/(tabs)/index.tsx` (Home tab). Layout top-to-bottom:

1. **Greeting + avatar** (`Good evening, Moriyanu`)
2. **Streak strip** (only renders if `streak.currentStreak > 0` — first session triggers a soft "fire" streak chip in History but not on Home until 2+ days)
3. **COMING UP section** ⭐ — if user filled in `upcoming.tsx`, shows horizontally scrollable cards (cap 3) with:
   - Event emoji in tinted circle (terracotta-tinted for primary card)
   - Title + urgency-coded countdown chip (≤3d=terracotta, 4-14d=cream, >14d=grey)
   - Description (italic) OR "+ Add specifics" CTA if empty
   - Readiness bar (composite of session count × recent avg × recency, 0-10, red/amber/green)
   - "+ Add" inline link when count < 3
   - Empty state: cream card with 🎯 "What's coming up? Add an interview, pitch, or hard chat. Sharp will bias every practice toward it."
4. **Daily Challenge hero** — terracotta CTA card, "Today's question is ready"
5. **PRACTICE section** with quota strip subtitle ("3 One Shot · 2 Threaded · 2 Industry left today" for Pro, or "1 free One Shot this week · Daily & Duels stay free" for free)
6. **2x2 mode grid**: One Shot · Threaded · Industry (Conversation tile gated behind FEATURES flag — currently false)
7. **Sharp Summary card** (links to Progress) — only if ≥ 2 sessions
8. **Your Context card** — links to context setup (role, company, situation, dream role, documents) — Pro only
9. **Recent Sessions** (last 5)

**The Coming Up section IS the strategic retention lever.** It reframes the app from "tool I use" to "thing I'm using to prepare for the pitch on the 28th." Backend prompts now bias every scenario toward the soonest event.

---

## 6. Free vs Pro feature breakdown

| Feature | Free | Pro (£19.99/mo or £149.99/yr) |
|---|---|---|
| Daily Challenge | ✓ | ✓ + full coaching |
| One Shot (90s scored answer + coaching) | 1/day (3/week cap — weekly cap bites first) | 3/day |
| Threaded (4-turn pressure rounds) | — | 2/day |
| Industry Insight (news-pulled scenarios) | — | 2/day |
| Live Conversation (ElevenLabs duplex voice) | — | 1/day (currently feature-flagged OFF) |
| Context (role/company/situation/docs) | — | ✓ |
| Sharp Summary (Progress dashboard with patterns) | — | ✓ |
| Practice the sharper version (re-record snippet) | — | ✓ |
| Model answers | — | ✓ |
| Sharp Duels (async 1v1) | ✓ free | ✓ free (gated for v1) |

**The biting free constraint**: 3 One Shots per WEEK (not per day). Weekly cap is what hits users in the second week and drives upgrades.

---

## 7. Backend AI infrastructure

- **Anthropic Claude Sonnet 4** for quality-critical paths (One Shot scoring, Threaded debrief, conversation debrief, daily question, document parsing)
- **Anthropic Claude Haiku 4.5** for fast paths (question gen, follow-ups, quality gate, progress summary, conversation setup/respond, news planning)
- **Prompt caching** on the scoring system prompt (~90% input cost reduction)
- **Groq Whisper Large v3 Turbo** for transcription
- **Together AI Kokoro-82M** primary TTS (am_michael voice) + **ElevenLabs** fallback + **expo-speech** offline fallback

Scoring rubric was recently recalibrated with explicit anchors so the curve is logarithmic (5-7 = honest middle, 8-9 = rare, 9+ = exceptional). Coupled with the Coming Up event injection into prompts.

---

## 8. Current onboarding pain points (known + suspected)

### Hard-evidence problems
1. **No per-screen funnel analytics** — can't measure drop-off between ONBOARDING_STARTED and ONBOARDING_COMPLETED.
2. **`PAYWALL_VIEWED` not fired** on either paywall screen — funnel attribution is broken at the conversion moment.
3. **Email confirmation flow** routes users out of the app to verify, then back in. No deeplink handler — user has to manually re-open Sharp. Likely a churn cliff.
4. **AI consent is a hard gate** — "Don't allow" routes back to `/onboarding` start. No second-chance copy explaining the cost of declining. Likely high abandon.
5. **Recording retry on <5 words** says "That was a bit quick!" — friendly but no clear instruction to try again. User might just close the app.

### Strong hypotheses (validated by audit + product testing)
6. **First impression score may inflate** despite calibration prompt — user testing showed scores climbing 5.2 → 8.4 in one week. If onboarding gives a 7+, value pitch feels less urgent.
7. **The skip path in `value.tsx`** ("Continue with free plan") routes DIRECTLY to /welcome, bypassing both `upcoming.tsx` AND `paywall.tsx`. Users who don't want to pay never see the Coming Up capture. This loses retention data AND skips the strategic personalization.
8. **The `upcoming.tsx` skip rate is unknown** — analytics fire but no funnel view shows it. Anecdotally, users skip optional steps at high rates.
9. **The paywall comparison table is dense** — 6 rows of small text. Might be reduced to 3-4 most-visceral diffs.
10. **No urgency on the trial CTA** — copy is "Start 7-Day Free Trial" + "Then £149.99/yr · Cancel anytime". No "limited time" or "today only" framing. (Note: ethically that's fine; commercially might be testable.)
11. **No social proof** anywhere in onboarding — no testimonials, no "X people prepared for their interview with Sharp last week", no ratings/reviews badge.
12. **Apple Sign In is primary** — good for iOS-first audience. But the email path UI is identical-weight, not de-prioritized — could lose conversion to email-fatigue.
13. **No "skip rate" friction reducer for Apple Sign In** — users on the email path still see "Skip for now" link. Apple Sign In users have no such escape, just go straight to challenge-intro. Inconsistent.

### Strategic gaps
14. **No referral or sharing mechanic in onboarding** — Duel (the viral mechanic) is built but gated for v1.
15. **No personalization until step 9** — `upcoming.tsx` is the first real "tell us about you" beyond your name. The recording challenge is generic ("Tell me about yourself"). Could the upcoming event be captured BEFORE the recording so the challenge is personalized? E.g., "Practice your investor pitch opening line" instead of "Tell me about yourself."
16. **No payment-failure recovery** — if RevenueCat purchase fails mid-flow, the user sees a generic Alert "Something went wrong. Please try again." and stays on paywall. No retry incentive, no email follow-up, no fallback to in-app messaging.
17. **No exit-intent capture** — user who dismisses paywall sees `Alert` then falls through to /welcome. No "wait, here's 50% off" or "would you like a reminder?" play.
18. **Welcome's "game plan" card** lists three actions but doesn't link to them — user has to navigate to Home and find Daily Challenge themselves. Could be tappable steps.

---

## 9. Design system rules (must follow)

- **Light mode only.** "Soft Dawn" palette — NO dark mode.
- **All colors from `src/constants/theme.ts`** — never hardcode.
- **Soft Dawn:**
  - Background: `#FAF6F0` cream, `#FFFFFF` cards, `#F5F0E8` inputs
  - Text: `#3A2A1A` primary, `#7A6A5A` secondary, `#A09080` tertiary, `#C0B0A0` muted
  - Accent: `#C07050` terracotta (primary CTA), `#FFF5EB` light bg, `#F0DCC8` border
  - Success: `#5A9A5A` sage green, `#E8F5E8` positive bg
  - Error: `#C05050`
- **Font**: System default, no custom fonts.
- **Weights**: 900 (black) for headings/scores, 700 (bold) for buttons, 600 (semibold) for labels, 400 (regular) for body.
- **Border radius**: 8 sm, 12 md, 16 lg, 20 xl, 999 pill.
- **Responsive**: `wp()` for width-percent, `fp()` for font-percent — never use raw px values.

**Voice/tone:**
- NEVER cite communication books or authors by name (Pyramid Principle, Made to Stick, Crucial Conversations, etc. — coach like you've read everything and quote nothing)
- Conversational, warm, but direct
- Specific over generic ("Lead with the number, not the abstract claim" > "Be more specific")
- Sharp Fox character with `happy / listening / thinking / celebrating` expressions

**Apple compliance rules:**
- Apple 3.1.2(c): billed amount must be most prominent on paywall, per-month equivalent smaller/muted
- EULA: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` linked on paywall + Settings
- AI consent required before any third-party AI call

---

## 10. Recent shipped improvements (last 7 days)

To avoid suggesting things already done:

- ✅ "Coming Up" / Big Conversation feature — onboarding step + Home cards + detail screen + backend injection
- ✅ Scoring recalibration with logarithmic anchors
- ✅ Pattern extraction gate lowered 5 → 3 sessions (trial users now see meta-insights)
- ✅ Daily quota strip on Home
- ✅ Info icons on Progress dimensions
- ✅ Sample-size caveat on trend chart (<5 sessions = "Directional")
- ✅ Recording playback (`recordingUri` now plays back, side-by-side with model answer)
- ✅ Threaded character name labels (Maya, Alex, etc. — not "SHARP")
- ✅ Conversation mode feature flag wired up but currently OFF
- ✅ IAP foreground sync + Manage Subscription link
- ✅ KeyboardAvoidingView on text-input screens

---

## 11. The ask for the improvement agent

You're building onboarding improvements aimed at:
1. **Capture** — convert more visitors-to-signups, more signups-to-trial-starts
2. **Retention** — convert more trial-starts-to-paying, more paying-to-day-30-still-paying

**Recommended starting checks:**
- Read the audit findings in section 8
- Look at PostHog data for current onboarding funnel (URL not provided here — confirm with team)
- Read this codebase's session-summary doc in `CLAUDE.md` for the broader product context
- Read `app/(tabs)/index.tsx` to understand what the post-onboarding Home looks like

**Constraints to respect:**
- Apple 3.1.2(c) paywall rules
- AI consent must remain a real gate (no dark patterns to bypass)
- Don't name communication books in user-facing text
- iOS-only audience (Apple Sign In primary)
- £19.99/mo / £149.99/yr pricing locked (RevenueCat configured, App Store Connect agreements active)
- The OnboardingGate logic at `app/_layout.tsx:63-90` is load-bearing for restored users — any flow change must keep that path coherent

**Code patterns to follow:**
- `FadeIn` for staggered entrance animations
- `ProgressDots` for step indicators
- `SharpFox` + `SpeechBubble` for character-driven onboarding screens
- `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` on any screen with TextInput
- All routes registered in `app/_layout.tsx` Stack.Screen list

**Files most likely to need edits:**
- All `app/onboarding/*.tsx`
- `src/services/analytics.ts` (add per-screen funnel events)
- `app/_layout.tsx` (Stack.Screen registration if adding new screens)

**Files NOT to edit without good reason:**
- `backend/prompts/index.js` (recently recalibrated)
- `src/constants/theme.ts` (design system locked)
- `src/services/premium.ts` (recently shipped, RevenueCat-bound)

---

## 12. Quick reference — file map

```
app/
├── _layout.tsx                    OnboardingGate logic, Stack route registration
├── (tabs)/
│   ├── index.tsx                  Home (with Coming Up section)
│   ├── history.tsx                Sessions list
│   └── settings.tsx               Profile, plan, account
├── onboarding/
│   ├── index.tsx                  Hook screen (entry)
│   ├── name.tsx
│   ├── signin.tsx
│   ├── ai-consent.tsx
│   ├── challenge-intro.tsx
│   ├── recording.tsx
│   ├── result.tsx
│   ├── value.tsx
│   ├── upcoming.tsx               (NEW — 15 May 2026)
│   ├── paywall.tsx
│   └── welcome.tsx
├── upcoming/
│   ├── new.tsx                    In-app event creation
│   └── [id].tsx                   Event detail (edit/delete/practice)
├── premium/
│   ├── index.tsx                  In-app paywall (post-onboarding)
│   └── interview-pack.tsx         Bundled package offering
├── one-shot/                      Practice flow
├── threaded/                      4-turn pressure rounds
└── conversation/                  Live voice (gated off for v1)

src/
├── constants/
│   ├── theme.ts                   Soft Dawn design tokens
│   ├── features.ts                FEATURES.conversation = false
│   └── badges.ts                  15 streak milestone badges
├── components/
│   ├── Animations.tsx             FadeIn, ScoreReveal, AudioWaveBars, ConfettiBurst, PulseDot
│   └── Illustrations.tsx          SharpFox, SpeechBubble, ProgressDots, FeatureCard
├── services/
│   ├── analytics.ts               PostHog wrapper + Events const
│   ├── auth.ts                    Apple Sign In + email
│   ├── storage.ts                 AsyncStorage + Supabase sync (~830 lines)
│   ├── premium.ts                 isPremium + canDoX + trackXUsage
│   ├── revenuecat.ts              IAP integration
│   ├── scoring.ts                 API calls to /api/score, /api/threaded/*, /api/question/generate
│   ├── transcription.ts           Groq Whisper
│   ├── tts.ts                     Kokoro/ElevenLabs/expo-speech with playRecording for user audio
│   └── notifications.ts           Expo push tokens
└── types/index.ts                 All TypeScript types

backend/
├── server.js                      Express routes
└── prompts/
    └── index.js                   All Claude prompts (scoring, debrief, follow-up, etc.)
```

---

That's everything. Read sections 2 + 8 carefully — that's where the actionable improvements live.
