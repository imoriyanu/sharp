# App Store Metadata — Sharp AI

> Single source of truth for everything that goes into App Store Connect.
> Current build: **2.0.0 (9)** — submitted 2026-05-14 addressing all four rejection items from build 6.

---

## 1. App basics

| Field | Value |
|---|---|
| App name | Sharp: AI Communication Coach |
| Subtitle | Speak Sharper Under Pressure |
| Bundle ID | `com.sharp.ai` |
| App Store Connect App ID | `6761378418` |
| Apple Team ID | `9HQYKH65D3` |
| Primary category | Education |
| Secondary category | Productivity |
| Age rating | 4+ |
| Copyright | © 2026 Sharp AI |
| Support URL | https://www.speaksharpai.com/ |
| Marketing URL | https://www.speaksharpai.com/ |
| Privacy Policy URL | (set in App Store Connect → App Privacy) |

---

## 2. Description (with EULA line — required for resubmission)

Paste into the **Description** field. The Terms of Use line at the end is required by Apple guideline 3.1.2(c) when using the standard EULA.

```
You know what you want to say. You just can't say it cleanly when it counts.

Sharp is your AI communication coach. Speak your answer. Get scored. Get coaching that quotes your exact words and shows you how to fix them — not in theory, but line by line.

No scripts. No fluff. Just speak, get scored, get sharper.


HOW IT WORKS

Sharp scores every response across five dimensions: Structure (do you lead with your point or bury it?), Concision (does every word earn its place?), Substance (are you specific, or filling air?), Filler Words (how many ums, likes, and basicallys slip through?), and Awareness (do you demonstrate real knowledge?).

After every session you get a breakdown of what worked with direct quotes, what to fix with before-and-after rewrites, a model answer showing what a 9/10 sounds like, and one coaching insight you'll actually remember.


FIVE WAYS TO PRACTISE

Daily Challenge — One question. 60 seconds. Build the habit.

One Shot — A full scored session with questions personalised to your role, company, and goals. 90 seconds to think on your feet.

Threaded Challenge — Four rounds of escalating follow-ups. No scores until the end. The pressure builds exactly like a real interview or difficult meeting.

Industry Insight — Questions built around real breaking news in your field. When someone asks "What do you think about that acquisition?" at work, you'll have something worth saying.

Sharp Duels — Challenge a friend to the same question. Record separately. Compare scores side by side. Always free.


BUILT AROUND YOUR CONTEXT

Tell Sharp your role, company, and what you're preparing for. Upload your CV, a job description, or meeting notes. Sharp generates questions that actually apply to you — and coaching that references your real experience.

Preparing for a PM interview at a specific company? Sharp asks what their interviewers ask and coaches you using details from your own background.


COACHING THAT QUOTES YOU

Generic feedback doesn't change how you speak. Sharp does this instead:

"You said 'we act as the agent that is going around, checking the health of the system' — 15 words of metaphor. Try: 'we monitor 500+ services across AWS.' Specific. Credible. Half the words."

Every session includes a model answer you can listen to, not just read.


WHO IT'S FOR

Engineers explaining technical decisions. PMs running stakeholder reviews. Founders pitching investors. Consultants presenting to clients. Students preparing for interviews.

If you speak at work and want to be taken seriously, Sharp is for you. The Daily Challenge takes less time than checking your email.


TRACK YOUR PROGRESS

Build streaks, earn 15 milestone badges, and watch your scores climb. Every past session stays reviewable with full coaching and model answers included.

Sharp Pro unlocks unlimited One Shot, Threaded, and Industry sessions, document uploads, progress analytics, and audio coaching summaries.


Start free. Speak daily. Get sharp.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

---

## 3. Promotional text (170 chars max)

```
New: Industry Insight mode — practise speaking about real-world news in your field. Plus Threaded Challenges with 4 rounds of escalating pressure. How sharp can you get?
```

---

## 4. Keywords (100 chars max)

```
speaking,interview,communication,public speaking,coach,pitch,presentation,filler words,speech,voice
```

---

## 5. What's New (v2.0)

```
- New onboarding consent flow for AI features — full transparency on what is processed and by whom
- In-app account deletion at Settings → Account → Delete account
- Subscription paywall updated with clearer pricing and Terms of Use links
- Polish across sign-in flows and pricing UI
- Performance and stability improvements throughout
```

---

## 6. App Review Information

### Sign-In Information
- **Sign-in required**: ❌ UNCHECKED — sign-in is optional for most features
- **Contact**: Isaac Adekola, +447367662777, Moriyanu.Adekola@yahoo.co.uk

### Notes (replace the old "sign in not required" placeholder)

```
Build 9 (2.0.0) addresses all four issues from the previous rejection of build 6.

DEMO ACCOUNT: Sign-in is not required to use the app. The reviewer can skip the sign-in step and proceed directly through onboarding. To test the account deletion flow, please sign in via the in-app Apple Sign In prompt (during onboarding or via Settings → Sign in) using any Apple ID, then navigate to Settings → Account → Delete account.

1) AI DATA SHARING (5.1.1(i), 5.1.2(i))
Before any user data is sent to a third-party AI service, the app displays a consent screen explaining what is sent, to whom, and why. The user must tap "Continue" to proceed.
- Path: Welcome → Name → Sign in (optional) → "Your first challenge" → Start speaking → AI Consent screen → Continue → Recording
- Providers disclosed: Anthropic, Groq, ElevenLabs, Together AI
- All operate under zero-retention API terms (also documented in the privacy policy under "AI Processing & Consent")

2) TERMS OF USE / EULA (3.1.2(c))
- Apple standard EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
- Linked in the App Description above
- Linked tappably in-app: on the onboarding paywall, on /premium (Settings → Upgrade), and in Settings → Legal → Terms of Use

3) SUBSCRIPTION PRICING HIERARCHY (3.1.2(c))
On the paywall, the billed amount ("£149.99/yr" or "£19.99/mo") is rendered as the largest, boldest, most prominent pricing element. The per-month equivalent for the annual plan ("£12.50/mo equivalent") appears underneath in smaller, muted text.

4) ACCOUNT DELETION (5.1.1(v))
In-app account deletion is available:
- Path: Settings → Account → Delete account
- Two-step confirmation: first alert explains the action; second alert requires the user to type DELETE
- The first alert reminds users to cancel any active subscription separately via Settings → Apple ID → Subscriptions
- Backend call deletes the auth user and cascades through all user data
- Idempotent: a retried delete on an already-deleted account returns success and cleans up local state

Thanks for the review.
```

---

## 7. Subscription products (App Store Connect → Subscriptions)

| Product | Type | Price | Trial |
|---|---|---|---|
| `sharp_monthly` | Auto-renewable | £19.99/month | 7-day free trial (Introductory Offer) |
| `sharp_annual` | Auto-renewable | £149.99/year | 7-day free trial (Introductory Offer) |

**Subscription Group**: `Sharp Pro` (both products in one group — allows users to switch tiers)
**Description**: "Sharp Pro unlocks unlimited practice with full AI coaching, threaded challenges, industry questions, document uploads, and progress analytics."

**Apple Small Business Program**: enrol post-launch (15% vs 30% commission for first $1M ARR).

---

## 8. App Privacy questionnaire (App Store Connect → App Privacy)

**Data collected**:

| Category | Linked to user | Used for | Used for tracking |
|---|---|---|---|
| Email Address | Yes | App Functionality | No |
| User Content → Audio Data | Yes | App Functionality | No |
| User Content → Other (transcripts, context) | Yes | App Functionality, Product Personalisation | No |
| Identifiers → User ID | Yes | App Functionality | No |
| Usage Data → Product Interaction | Yes | Analytics, Product Personalisation | No |
| Diagnostics → Crash Data, Performance Data | No | Analytics | No |

**Third-party processing disclosures**:
- Audio Data → Groq (for transcription, deleted immediately)
- User Content → Anthropic (for scoring + coaching)
- Identifiers, Usage Data → PostHog (analytics, anonymised distinctId)
- Identifiers → RevenueCat (subscription management)
- All data → Supabase (storage, hosted EU)

**Used to Track You**: NONE. Zero-retention API terms with all AI providers; no advertising IDs; no cross-app tracking.

---

## 9. Rejection reply (paste in submission reply box after Update Review)

Use this when replying to the May 12 rejection with the screen recording attached:

```
Hello,

Thank you for the detailed review and the attached screenshot. Build 9 (2.0.0) addresses all four issues from the previous rejection. The attached screen recording demonstrates each fix end-to-end.

1) Guidelines 5.1.1(i) + 5.1.2(i) — AI data sharing: at exactly the point shown in your attached screenshot (the moment between "Start recording" and the iOS microphone prompt), Build 9 now displays a dedicated AI consent screen. It names the four third-party providers we use (Anthropic, Groq, ElevenLabs, Together AI), describes the data sent to each (voice recording, transcript, any text or files the user chooses to upload), and requires the user to tap "Continue" before any data leaves the device. The privacy policy has been updated with a dedicated "AI Processing & Consent" section identifying providers, data flow, and confirming zero-retention API terms.

2) Guideline 3.1.2(c) — EULA: Apple's standard Terms of Use is now linked in the App Description and tappably in-app on the subscription purchase screen, on /premium, and in Settings → Legal → Terms of Use.

3) Guideline 3.1.2(c) — Pricing hierarchy: the billed amount ("£149.99/yr" or "£19.99/mo") is now the largest, boldest, most prominent pricing element on the paywall. The per-month equivalent for the annual plan ("£12.50/mo equivalent") appears beneath it in subordinate, smaller, muted text.

4) Guideline 5.1.1(v) — Account deletion: Settings → Account → Delete account opens a two-step confirmation flow that permanently deletes the user's account and all associated data. Subscription cancellation guidance via Settings → Apple ID is included in the confirmation copy.

Full reproduction paths are in the App Review Information Notes field. Happy to provide any further clarification.

Best,
Moriyanu
```

---

## 10. Screen recording script (90 seconds, for rejection reply)

Record on physical iPhone running TestFlight Build 9.

```
0:00–0:15 — AI Consent screen
  - Launch fresh app
  - Tap through Welcome → Name → Sign in with Apple
  - Tap through Challenge intro → "Start speaking"
  - HOLD on AI Consent screen (5s, name visible)
  - Tap Continue

0:15–0:35 — Pricing + EULA links
  - Open Settings → tap "Upgrade" (or open /premium directly)
  - HOLD on Annual card so "£149.99/yr" large + "£12.50/mo equivalent" small (3s)
  - Scroll to bottom of paywall
  - Tap "Terms of Use" — Safari opens stdeula (3s)
  - Swipe back

0:35–1:30 — Account deletion
  - Tab to Settings → scroll to Account
  - Tap "Delete account"
  - First Alert visible — read for a moment → tap Continue
  - Second Alert — type DELETE in text field → tap "Delete forever"
  - HOLD on redirect to onboarding (3s)
```

How to record: pull down Control Center → Screen Recording → 3s countdown → start. After: end via red bar → find in Photos → AirDrop to Mac.

---

## 11. Screenshots

| Size | File location | Status |
|---|---|---|
| 6.5" Display (iPhone 11 Pro Max etc.) | `screenshots/final/6.5inch/*.png` | 4 of 10 uploaded |
| 6.9" Display (iPhone 17 Pro Max etc.) | `screenshots/final/6.9inch/*.png` | TODO |
| App Previews (video) | n/a | None — 0 of 3 |

Min required: 3 screenshots at 6.5" Display. Currently have 4 uploaded (Daily Challenge, Score breakdown, Coaching insight, Paywall).

---

## 12. Manual release vs auto release

**Recommendation**: **Manually release** v1 so you can:
- Watch RevenueCat / PostHog dashboards during initial spike
- Coordinate launch announcement
- Roll back gracefully if a regression appears

Set to Manual until you've shipped a clean v1 with no immediate critical bugs.

---

## 13. Submission checklist (final)

Before pressing "Update Review":

- [ ] Description has the EULA line at the end
- [ ] Notes field has the long Build 9 description
- [ ] Build 9 (2.0.0, build 9) selected
- [ ] Privacy Policy URL set to https://www.speaksharpai.com/privacy (or wherever hosted)
- [ ] App Privacy questionnaire matches §8 above
- [ ] Screenshots uploaded (min 3)
- [ ] Subscription products live in App Store Connect with 7-day Introductory Offer
- [ ] Release type = Manually release

Then:

- [ ] Install Build 9 from TestFlight on real device
- [ ] Record 90s screen recording per §10
- [ ] Click "Update Review"
- [ ] Reply to rejection message with §9 + attached video

---

## 14. Common rejection patterns to avoid in future

| Pattern | How we handle |
|---|---|
| AI data sharing without consent | `app/onboarding/ai-consent.tsx` + retro-gate in OnboardingGate |
| EULA missing | Apple stdeula linked in App Description + in-app on paywall + Settings |
| Pricing hierarchy reversed | `s.planPrice` style renders billed amount (fp(24-28) black); per-month is `s.planPerMonth` (fp(10) muted) |
| No account deletion | Settings → Account → Delete account with two-step confirm |
| Subscription trial confusion | "Then £X · Cancel anytime" sub-copy + Apple Introductory Offer set up |
| Per-month-as-headline | Apple specifically prohibits — billed amount must dominate |
| Hidden third-party providers | Named in consent + privacy policy with zero-retention API terms confirmation |
