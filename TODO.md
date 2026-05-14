# Sharp — TODO

> Pre-launch + early-post-launch. Many items from the original launch list are now done.
> Last updated: 2026-05-14.

---

## ✅ Done

- Subscription products live (`sharp_monthly` £19.99/mo, `sharp_annual` £149.99/yr)
- 7-day free trial Apple Introductory Offers configured
- Free tier: 3 One Shots/week (post-pricing-review tightening)
- Paywall pricing hierarchy: billed amount largest, per-month subordinate (Apple 3.1.2(c))
- Privacy + Terms of Use links in-app on paywall + premium + Settings
- App Store Connect description updated with Apple stdeula link
- AI consent screen at `app/onboarding/ai-consent.tsx` + retro-gate (Apple 5.1.1(i) + 5.1.2(i))
- Privacy policy updated with "AI Processing & Consent" section (`app/privacy/index.tsx`)
- In-app account deletion: Settings → Account → Delete account (Apple 5.1.1(v))
- Backend `POST /api/account/delete` endpoint with idempotent 204 + service-role cascade
- `clearAllUserData()` helper for local AsyncStorage wipe
- `apiPost` handles 204 No Content + empty bodies (the JSON-parse bug fix)
- Backend deployed to Railway, account-delete endpoint live
- Build 8 + Build 9 EAS production builds completed
- Build 9 includes all delete-account fixes baked in for App Review
- TTS via Together AI Kokoro (am_michael voice) with ElevenLabs fallback
- Sonnet/Haiku model routing for cost optimisation
- Prompt caching on scoring (~90% input cost reduction)
- Rich `buildUserContextBlock()` natural-language prompt context

---

## 🚧 In progress / waiting

- [ ] App Store Connect: paste Description with EULA line, paste new Review Notes, Save
- [ ] App Store Connect: confirm App Privacy questionnaire reflects AI provider data flow
- [ ] Install Build 9 from TestFlight on physical iPhone once ready
- [ ] Record 90s screen recording (consent screen → pricing/EULA → account deletion)
- [ ] App Store Connect: click Update Review to resubmit Build 9
- [ ] App Store Connect: reply to May 12 rejection with recording + reply message (see `app-store-metadata.md` §9)
- [ ] Apple App Review (24-48h typical for resubmissions)

---

## Pre-launch nice-to-haves (do if time)

- [ ] Wire `app/premium/interview-pack.tsx` to RevenueCat non-consumable (currently "Coming soon" alert)
- [ ] Enrol in Apple Small Business Program (15% commission vs 30%) — submit application post-approval
- [ ] Add Privacy Policy URL to App Store Connect (currently set?)
- [ ] Upload 6.9" Display screenshots (currently only 6.5")
- [ ] Set up support email `support@getsharp.app` mailbox
- [ ] Confirm Privacy Policy is live at https://www.speaksharpai.com/privacy

---

## RevenueCat

- [x] `sharp_monthly` + `sharp_annual` configured
- [x] 7-day intro offers
- [x] `Purchases.addCustomerInfoUpdateListener` wired in `revenuecat.ts` for real-time entitlement updates
- [x] Webhook hardened (timing-safe Bearer compare, UUID validation, event allowlist)
- [ ] Verify subscription products show real prices on the paywall in production build
- [ ] Test purchase flow in sandbox with TestFlight Build 9
- [ ] Test restore purchases flow

---

## Post-launch (Week 1-4)

- [ ] Monitor PostHog: trial-to-paid conversion, D1/D7 retention, paywall view rate
- [ ] Monitor RevenueCat dashboard: subscription health, refunds, conversion funnel
- [ ] Monitor Railway logs: errors, latency, agent_traces table
- [ ] App Store review monitoring (respond to negative reviews within 24h)
- [ ] Tune Haiku/Sonnet routing if any quality drops surface
- [ ] First "What's New" update bumping minor version (any post-launch fix)

---

## Growth — Phase 1 (Months 1-3)

- [ ] TikTok account for Sharp — first 10 videos: "Score My Answer", "One Sentence Rewrites", "Duel Challenges"
- [ ] Instagram + YouTube Shorts cross-posting (4-5/day)
- [ ] Product Hunt coming-soon page
- [ ] "DM the founder" campaign: 50/wk on LinkedIn
- [ ] Add "Share your score" social card after each session (branded image)
- [ ] App Store rating prompt after scores > 7.5

---

## Growth — Phase 2 (Months 4-9)

- [ ] Product Hunt launch (aim top 3)
- [ ] 10 UK university careers centres — "Sharp for Students" outreach
- [ ] Consider web billing via Stripe to bypass Apple 30% (post Small Business Program)
- [ ] B2B coach SaaS surface (1-coach-many-clients dashboard)

---

## Future features

- [ ] **Pro+ tier (£29.99/mo)** — voice analysis (pace, pitch, energy), audio history cloud sync, voice-cloned model answers
- [ ] Pre-generated question pool (batch-generate, serve from DB — cuts Claude costs ~40%)
- [ ] 6-turn and 8-turn Threaded modes for advanced users
- [ ] Scenario-specific threads (salary negotiation, technical interview, board update)
- [ ] Re-enable `FEATURES.conversation` once `app/conversation/*` is bulletproofed
- [ ] Realtime Coaching prototype (`app/realtime-coaching/`) — decide ship or kill
- [ ] Python `backend/ai-service/` integration (RAG + multi-agent debrief)
- [ ] iPad layout (currently iPhone-only)
- [ ] Android port (post-iOS traction)

---

## Architecture polish (post-launch)

- [ ] Multi-instance Railway scaling — distributed cron, Redis-backed rate limit
- [ ] Circuit breaker for Groq/Together/Anthropic failures
- [ ] Single SQL query for `get_recent_sessions` (currently JS join, fine <100 sessions/user)
- [ ] `apiUsage` in-memory map → DB rows once multi-instance
- [ ] Waitlist/FeatureRequest file storage → Supabase
