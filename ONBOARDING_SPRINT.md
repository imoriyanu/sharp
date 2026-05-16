# Sharp AI — Onboarding Sprint (Brutal Lean)

> 5 changes. 3.5 days. Ships pre-launch. Nothing else gets in.
> If you only get 1 day: ship #1 + #2.

---

## Context

Builds #14 + #15 are queued for TestFlight (Coming Up feature + spacing fixes). Onboarding currently funnels through 11 screens with a generic "Tell me about yourself" recording. The reviewer's brutal-lean spec identifies 5 load-bearing changes that should double onboarding → paid conversion and prevent the "fully onboarded, un-monetised, un-personalised" zombie cohort.

The single load-bearing change is reordering so the Big Conversation event is captured **before** the first scored recording — which unlocks personalisation, which unlocks the conversion lever, which makes the welcome screen's durable promise land.

---

## The 5 changes

### #1 — Reorder onboarding · 1-2 days

**Current flow** (verified in `app/onboarding/*.tsx`):
```
name → signin → challenge-intro → ai-consent → recording → result → value → upcoming → paywall → welcome
```

**New flow:**
```
name → signin → ai-consent → upcoming → challenge-intro → recording → result → value → paywall → welcome
```

**File changes:**

| File | Line | Change |
|---|---|---|
| `app/onboarding/signin.tsx` | 32, 63, 206 | `router.push('/onboarding/challenge-intro')` → `'/onboarding/ai-consent'` (all 3: Apple path, email path, skip path) |
| `app/onboarding/ai-consent.tsx` | 14-15 | Default `next` param changes from `'/onboarding/recording'` → `'/onboarding/upcoming'`. **Also**: branch on `hasOnboarded()` — if true (retro-gate path), route to `/(tabs)` not /upcoming. Prevents existing users being dragged into upcoming after consent re-prompt. |
| `app/onboarding/challenge-intro.tsx` | 52 | `router.push('/onboarding/ai-consent')` → `'/onboarding/recording'` |
| `app/onboarding/upcoming.tsx` | 81, 86 | `router.push('/onboarding/paywall')` → `'/onboarding/challenge-intro'` (both save path and skip path) |
| `app/onboarding/value.tsx` | 51 | Revert previous edit: CTA → `'/onboarding/paywall'` (was `'/onboarding/upcoming'`) |
| `app/_layout.tsx` | ProgressDots `total` | Currently shows `total={5}` with `current={0-4}` across name/signin/challenge-intro/recording/result. Update step indices to match new order. Or kill ProgressDots — brutal lean. |

**Also simplify upcoming.tsx (same screen, killed friction):**
- Keep the 9 event-type chips and 6 when chips
- **Remove the description TextInput entirely** (`<TextInput style={s.input} ...>` and surrounding section)
- Remove the `description` state and the `KeyboardAvoidingView` wrapper (no input → no keyboard concerns)
- `saveUpcomingEvent` call drops the `description` field
- Two taps to advance: pick type, pick when, tap CTA

The detail screen (`app/upcoming/[id].tsx`) still has the description edit affordance for users who want to add it later — moves it out of onboarding's critical path.

---

### #2 — Personalise the first recording · 0.5 day

The user has just told you the conversation they're preparing for. Use it.

**Build the template map** in a new file `src/constants/onboarding-questions.ts`:

```typescript
import type { UpcomingEventType } from '../types';

// Pre-authored opening question per event type. Used by onboarding's
// challenge-intro + recording screens to personalise the first 30s.
// If the user skipped upcoming.tsx, fall back to OTHER ("Tell me about
// yourself") — the original generic question.
export const ONBOARDING_QUESTION_BY_TYPE: Record<UpcomingEventType, string> = {
  interview:       'Why are you the right person for this role?',
  pitch:           'Why now? Why you?',
  raise:           'Walk me through why you have earned this.',
  review:          'Walk me through your biggest win this year.',
  feedback:        "What's the hardest thing you need to say?",
  sales:           'Why should they buy from you?',
  presentation:    'Open it. Hook me in 30 seconds.',
  difficult_convo: 'What do you need to say to them?',
  other:           'Tell me about yourself, who you are and what you do.',
};

export const ONBOARDING_QUESTION_FALLBACK =
  'Tell me about yourself, who you are and what you do.';
```

**File changes:**

| File | Change |
|---|---|
| `app/onboarding/challenge-intro.tsx` | On mount, call `getActiveUpcomingEvents()`. If first event exists, look up `ONBOARDING_QUESTION_BY_TYPE[event.type]`, otherwise use `ONBOARDING_QUESTION_FALLBACK`. Render that question in the `detailsQuestion` block (currently hardcoded `"Tell me about yourself..."`). Pass via router param to recording. |
| `app/onboarding/recording.tsx` | Replace `const QUESTION = 'Tell me about yourself, who you are and what you do.'` (line 16) with reading from `useLocalSearchParams().question`, falling back to `ONBOARDING_QUESTION_FALLBACK`. Use this throughout. |
| `app/onboarding/result.tsx` | Receive `question` via params, pass through to `scoreAnswer` call already (recording.tsx:86 passes question to scoring). No render change needed if context line stays generic. |

**Acceptance**: User who selects "Pitch / investor" in `upcoming.tsx` lands on challenge-intro with *"Why now? Why you?"* as the displayed question. Recording uses the same question. Scoring prompt receives the same question.

---

### #3 — Audio model answer on result screen · 1 day

**Onboarding result (free model answer = the conversion taste):**

`app/onboarding/result.tsx` already receives `modelAnswer` via params (recording.tsx:94 passes it). It just doesn't render. Add a block after the "Your first coaching insight" card (~line 95):

```tsx
{modelAnswer ? (
  <FadeIn delay={1900}>
    <TouchableOpacity style={s.modelCard} onPress={playModelAnswer} activeOpacity={0.7}>
      <Text style={s.cardEmoji}>✨</Text>
      <Text style={s.cardLabel}>Here's what a 9.0 sounds like</Text>
      <Text style={s.modelText}>"{modelAnswer}"</Text>
      <View style={s.modelListenRow}>
        <Text style={s.modelListenBtn}>
          {playingModel ? '⏸ Pause' : '🔊 Listen'}
        </Text>
      </View>
    </TouchableOpacity>
  </FadeIn>
) : null}
```

Wire `playModelAnswer` to `playModelAudio` from `src/services/tts.ts`. Auto-play once on screen entry (after the coaching insight TTS finishes).

**Post-onboarding (Pro-gate the model answer):**

`app/one-shot/results.tsx` currently renders model answer for everyone. Wrap behind `isPremium()`:

| State | Rendered |
|---|---|
| `isPremium() && modelAnswer` | Existing model card + listen button |
| `!isPremium() && modelAnswer` | Locked variant: "Hear what a 9/10 sounds like" + 🔒 + "Unlock with Pro" CTA → `/premium` |

**File changes:**

| File | Change |
|---|---|
| `app/onboarding/result.tsx` | Add model card block + import `playModelAudio`. Auto-play on mount after coaching insight. State `playingModel`. ~30 lines added. |
| `app/one-shot/results.tsx` | Gate the existing model-answer card with `isPremium()`. Add locked variant routing to `/premium`. The user's own recording playback (left card) stays free for everyone. |

**Acceptance**: New user finishes onboarding recording, sees their score, hears the model answer in the Sharp coach voice. Same user does a post-onboarding One Shot as free — model answer card shows locked CTA, not the answer.

---

### #4 — Rewrite welcome · 0.5 day (copy only)

**File**: `app/onboarding/welcome.tsx`

Replace the 3-step game plan card (lines ~47-75) with one paragraph + one CTA. Reads the active upcoming event on mount and substitutes the days countdown.

**Copy:**

```typescript
const days = event ? daysUntilEvent(event.eventDate) : null;
const eventLine = days !== null && days >= 0
  ? `Your event is in ${days} day${days === 1 ? '' : 's'}.`
  : '';
const heading = pro ? "You're Sharp Pro." : `You're in, ${name || 'friend'}.`;
const body = `Sharp learns how you speak across sessions — by your third session, the coaching starts catching your patterns. ${eventLine} Let's get to work.`;
```

Strip the entire `tipsCard` View and its styles (~70 lines deletable).

**File changes:**

| File | Change |
|---|---|
| `app/onboarding/welcome.tsx` | Import `getActiveUpcomingEvents`, `daysUntilEvent` from storage. Replace tipsCard with `<Text>{body}</Text>`. CTA text → "Start practicing". Strip unused styles (`tipsCard`, `tipsTitle`, `tipRow`, `tipNum`, `tipNumText`, `tipContent`, `tipTitle`, `tipDesc`). |

**Acceptance**: User who set "Difficult conversation, 3 days away" lands on welcome reading: *"You're in, Moriyanu. Sharp learns how you speak across sessions — by your third session, the coaching starts catching your patterns. Your event is in 3 days. Let's get to work."*

---

### #5 — Fix value.tsx skip leak · 15 min

**File**: `app/onboarding/value.tsx:55`

Single line change:

```diff
-          <TouchableOpacity onPress={() => router.replace('/onboarding/welcome')} ...>
+          <TouchableOpacity onPress={() => router.replace('/onboarding/paywall')} ...>
             <Text style={s.skipText}>Continue with free plan</Text>
           </TouchableOpacity>
```

Combined with #1's reorder (upcoming runs before value), this guarantees every user sees the paywall before landing on welcome. Paywall still has its own demoted skip → welcome, so users with strong intent to stay free can still escape.

**Acceptance**: Both CTA tap and skip tap on value.tsx route to `/onboarding/paywall`. Zero zombie path.

---

## Implementation order

**Day 1** (load-bearing):
- Morning: #1 reorder (signin → ai-consent → upcoming → challenge-intro → recording, value → paywall) + simplify upcoming.tsx
- Afternoon: #2 personalised question (`onboarding-questions.ts` constants + challenge-intro + recording)

**Day 2:**
- Morning: #3a — audio model answer block on `app/onboarding/result.tsx`
- Afternoon: #3b — Pro-gate model answer on `app/one-shot/results.tsx`

**Day 3:**
- Morning: #4 welcome rewrite (copy + tipsCard removal)
- Mid-morning: #5 value.tsx skip leak (15 min)
- Rest: end-to-end smoke test on TestFlight, fix anything that breaks, ship build

**Total: 2.5-3 days of focused work.** Buffer the remaining 0.5 for surprises.

---

## If you only get 1 day

Ship #1 + #2. That's the load-bearing change. Without #1, #2 is impossible. Without both, #3/#4/#5 have nothing to attach to.

---

## What you DON'T ship pre-launch

Hold these in the backlog. Confirmed deferred per spec:

- ❌ Micro-Threaded in onboarding — adds complexity; Threaded gets its wow moment via Daily Challenge / first post-onboarding session
- ❌ AI consent decline graceful fallback — fix only if PostHog shows >10% drop here post-launch
- ❌ Apple Sign In skip-link parity — half-day fix, not urgent
- ❌ Day-1 push notification — ship after event-tied notifications (task #12)
- ❌ Sharp's stage-direction TTS audit — production-test first
- ❌ Hook copy rewrite (11.1) — not load-bearing

---

## Verification

**Per-change acceptance criteria above. Full sprint end-to-end test:**

1. Wipe app data (Settings → Delete account, or fresh install)
2. Tap through onboarding:
   - index → "Find out how sharp you are"
   - name → "Moriyanu"
   - signin → email/password (or Apple)
   - ai-consent → Allow
   - **upcoming** → pick "Pitch / investor" + "In 2 weeks" → Save
   - challenge-intro shows *"Why now? Why you?"* as the question
   - recording → 30s answer
   - result → score + dimensions + **audio model answer plays once + Listen replay button**
   - value → "Start 7-Day Free Trial" → paywall
   - value skip path: tap "Continue with free plan" → **also lands on paywall** (not welcome)
   - paywall → either purchase or dismiss
   - welcome → *"You're in, Moriyanu. Sharp learns... Your event is in 14 days. Let's get to work."* + "Start practicing"
3. From Home, do a One Shot as a free user → results screen shows **locked** model answer card with "Unlock with Pro"
4. From Home, do a One Shot as Pro user → results screen shows model answer with Listen button (unchanged)
5. Verify retro-gate: simulate "existing user, no consent yet" → ai-consent → Allow → lands on `/(tabs)` (NOT /onboarding/upcoming)

**Typecheck before commit:**
```bash
npx tsc --noEmit
```

**Backend prompt module loads (no break in scoring chain):**
```bash
cd backend && node -e "require('./prompts/index.js'); console.log('OK')"
```

**Ship to TestFlight:**
```bash
eas build --platform ios --profile production --auto-submit --non-interactive --no-wait
```

---

## Files touched (summary)

```
app/onboarding/signin.tsx          ~3 line changes (route targets)
app/onboarding/ai-consent.tsx      ~5 lines (default route + retro-gate branch)
app/onboarding/challenge-intro.tsx ~15 lines (event lookup + question render + route)
app/onboarding/upcoming.tsx        ~40 lines removed (description input + KAV wrapper) + route change
app/onboarding/recording.tsx       ~10 lines (read question from params)
app/onboarding/result.tsx          ~30 lines (model answer block + auto-play)
app/onboarding/value.tsx           ~2 line changes (CTA + skip both to paywall)
app/onboarding/welcome.tsx         ~60 lines removed, ~5 added (tipsCard → paragraph + days count)
app/_layout.tsx                    optional ProgressDots step indices (or kill)
app/one-shot/results.tsx           ~20 lines (Pro-gate model answer card + locked variant)
src/constants/onboarding-questions.ts  NEW ~25 lines
```

**Net diff estimate**: ~150 added, ~120 removed = ~30 net lines + 1 new file. Easy to review, fast to ship.

---

## What happens after launch

Per the spec: don't ship anything else until PostHog data validates these landed. The 5 changes above are the bet. Wait for data before doubling down or pivoting.

Suggested first post-launch metric to watch:
- **D7 retention** for users who completed onboarding with an upcoming event vs. those who skipped upcoming.tsx
- If the event-saved cohort retains 2x better → the bet is real, build the Day-1 push (deferred above)
- If retention is similar → the event injection isn't doing the work the spec hoped, re-think
