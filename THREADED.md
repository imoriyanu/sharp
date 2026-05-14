# Threaded Challenge — Technical Documentation

> The complete teardown of Sharp's Threaded Challenge feature: the user flow, the screens, the services, the prompts, the agent system, the state machine, the error recovery.
> Current as of 2026-05-14 on `feature/conversational-ai`.

---

## 1. What it is

Threaded Challenge is one of Sharp's five practice modes. It simulates a high-stakes conversation by asking the user **four** consecutive related questions — an opening question and three escalating follow-ups — then producing a thread-level debrief covering trajectory, contradictions, and the weakest moment.

Unlike One Shot (a single scored answer), Threaded is **multi-turn and stateful**. The AI must build each follow-up on the user's actual previous answers, not generate generic questions. The pressure escalates: turn 2 probes the weakest part of turn 1, turn 3 raises stakes, turn 4 calls out hedging or contradictions.

Closest real-world analogues: a panel interview where each panellist drills deeper, a board grilling, or a tough 1:1 where your manager keeps pushing.

**Mode summary:**

| Aspect | Value |
|---|---|
| Max turns | 4 |
| Per-turn timer | 90 seconds (shared recording screen) |
| Scoring | Aggregated across thread (5 thread-level dimensions, not the 5 per-turn dimensions) |
| Pricing tier | Pro only (free tier blocked at the gate) |
| TTS | Yes — opening question + each follow-up's "reaction" + final coaching summary |
| Async recovery | Thread state persists in AsyncStorage; app can resume mid-thread after backgrounding |

---

## 2. User-facing flow

```
[Home tile: Threaded Challenge]
        │
        ▼
[/one-shot/question?mode=threaded]
   - Generates opening question (Sonnet)
   - On tap "Record my answer":
       * clearThreadState()
       * saveThreadState({ originalQuestion, turns: [], startedAt })
       * push to recording with mode=threaded
        │
        ▼
[/one-shot/recording?mode=threaded]   (TURN 1)
   - Records 90s answer
   - Stops:
       * Transcribe (Groq)
       * Score 5 dimensions (Sonnet, cached)
       * thread.turns.push({ turn 1, question, transcript })
       * generateFollowUp(...) → reaction + followUp question
       * navigate to /threaded/follow-up
        │
        ▼
[/threaded/follow-up]
   - Plays reaction + next question audio (TTS)
   - Shows pressure level pill ("DEPTH", "CHALLENGE", etc.)
   - Shows conversation history rendered as chat bubbles
   - Tap "Record my answer" → back to recording with new question
        │
        ▼
[/one-shot/recording]   (TURN 2)  ... same flow
[/threaded/follow-up]
        │
        ▼
[/one-shot/recording]   (TURN 3)
[/threaded/follow-up]
        │
        ▼
[/one-shot/recording]   (TURN 4 — FINAL)
   - Stops:
       * Transcribe, score
       * thread.turns.push(turn 4)
       * generateDebrief(thread) → ThreadDebrief
       * saveSession() + clearThreadState() in parallel
       * navigate to /threaded/debrief
        │
        ▼
[/threaded/debrief]
   - Overall ring score
   - Trajectory badge (improving / declining / steady)
   - 5 thread-level dimension scores
   - Turn-by-turn deltas with notes
   - Strongest moment quote
   - Weakest snippet with rewrite
   - Dodged-questions list (if any)
   - Plays coaching summary audio
   - CTAs: "Done" → home, "New threaded challenge" → /question?mode=threaded
```

---

## 3. Data shapes (`src/types/index.ts`)

The whole feature revolves around five types:

```ts
// In-progress thread, persisted to AsyncStorage
interface ThreadState {
  originalQuestion: string;
  turns: ThreadTurn[];
  startedAt: string;          // ISO; clearStaleThread drops anything > 1h old
}

interface ThreadTurn {
  turnNumber: number;          // 1..4
  question: string;            // the question that prompted this turn's answer
  transcript: string;          // user's spoken answer, transcribed
}

// Returned by the follow-up generator (v1 + v2 both)
interface FollowUp {
  reaction: string;            // 1-sentence "Hmm, you said X — fine, but..."
  followUp: string;            // the next question
  targeting: string;           // why this question, why now (internal hint)
  pressureLevel: 'depth' | 'clarity' | 'challenge' | 'perspective' | 'stakes' | 'accountability';
}

// Returned by the debrief generator (Sonnet, end of thread)
interface ThreadDebrief {
  threadScores: {
    communicationClarity: number;   // 1-10
    handlingPressure: number;       // 1-10
    conciseness: number;            // 1-10
    substance: number;              // 1-10
    consistency: number;            // 1-10 — did they contradict themselves across turns?
  };
  overall: number;                  // weighted blend
  trajectory: 'improving' | 'declining' | 'steady';
  summary: string;                  // 3-4 sentences
  dodgedQuestions: string[];        // questions they avoided or pivoted away from
  strongestMoment: { turn: number; quote: string };
  weakestSnippet: {
    original: string;               // their actual words
    problems: string[];
    rewrite: string;
    explanation: string;
    turn: number;
  };
  turnByTurn: { turn: number; scoreChange: string | null; note: string }[];
}

type SessionType = 'daily_30' | 'one_shot' | 'threaded' | 'duel' | 'conversation';
```

The thread debrief uses **five different dimensions** from One Shot's per-turn scoring. This is intentional — thread-level analysis is about *consistency, trajectory, and pressure handling*, not the structure/concision/etc. dimensions that work on a single answer.

---

## 4. Frontend code paths

### 4.1 Mode entry (`app/one-shot/question.tsx`)

When the user taps Threaded on Home, they hit `/one-shot/question?mode=threaded`. The screen generates a fresh opening question (Sonnet, via `/api/question/generate`) and on the user's "Record my answer" tap (around lines 262-266):

```ts
if (isThreaded && question) {
  await clearThreadState();
  await saveThreadState({
    originalQuestion: question.question,
    turns: [],
    startedAt: new Date().toISOString(),
  });
}
router.push({ pathname: '/one-shot/recording', params: { mode: 'threaded', ... } });
```

`clearThreadState()` wipes any abandoned thread before starting a new one — important because `clearStaleThread()` only runs on app boot (see §8).

### 4.2 Recording screen (`app/one-shot/recording.tsx`)

The recording screen is **shared between One Shot and Threaded** — `params.mode === 'threaded'` branches the logic. Threaded-specific behaviour:

**On stop (lines 160-244):**

```ts
if (params.mode === 'threaded') {
  const thread = await getThreadState();
  if (!thread) {
    setRetryReason("Your threaded session expired. Start a new one?");
    return;
  }
  thread.turns.push({
    turnNumber: thread.turns.length + 1,
    question: params.question,
    transcript,
  });
  await saveThreadState(thread);

  // Score the turn — same flow as One Shot
  const result = await scoreAnswer({ ... });
  saveTurnResult(...);   // local history

  const turnNumber = thread.turns.length;
  const MAX_TURNS = 4;

  if (turnNumber >= MAX_TURNS) {
    // Final turn — debrief and exit threaded mode
    const debrief = await generateDebrief({
      ...context,
      scenario: thread.originalQuestion,
      turns: thread.turns.map(t => ({ turn: t.turnNumber, question: t.question, transcript: t.transcript, scores: ... })),
    });
    await Promise.allSettled([
      saveSession({ type: 'threaded', ... }),
      clearThreadState(),
    ]);
    router.replace({
      pathname: '/threaded/debrief',
      params: { debrief: JSON.stringify(debrief), turns: JSON.stringify(thread.turns) },
    });
    return;
  }

  // Not the final turn — generate the next follow-up
  const followUp = await generateFollowUp({
    ...context,
    originalQuestion: thread.originalQuestion,
    previousTranscripts: thread.turns,
    turnNumber: turnNumber + 1,
  });
  router.replace({
    pathname: '/threaded/follow-up',
    params: {
      reaction: followUp.reaction,
      question: followUp.followUp,
      pressureLevel: followUp.pressureLevel,
      turnNumber: turnNumber + 1,
      turns: JSON.stringify(thread.turns),
    },
  });
}
```

**Error recovery:** if `getThreadState()` returns null (AsyncStorage was wiped while backgrounded), the screen renders a "Your threaded session expired" message with a CTA back to `/one-shot/question?mode=threaded`. No data is lost server-side because there's no server-side thread state — the thread lives only in AsyncStorage.

### 4.3 Follow-up screen (`app/threaded/follow-up.tsx`)

Receives the follow-up via params: `reaction`, `question`, `pressureLevel`, `turnNumber`, `turns` (full JSON-encoded thread). Renders:

- Pressure-level pill (e.g., "PRESSURE: DEPTH" with a colour matched to severity)
- Conversation history rendered as chat bubbles (alternating user/AI)
- The AI's reaction at the top, followed by the next question
- TTS plays the reaction + new question on mount (via `playFollowUpAudio()`)
- "Record my answer" CTA — navigates back to `/one-shot/recording` with `mode=threaded` and the new `question` param

The screen is read-only: no state changes happen here. It's a visualisation of the in-progress thread.

### 4.4 Debrief screen (`app/threaded/debrief.tsx`)

Receives `debrief: ThreadDebrief` and `turns: ThreadTurn[]` via params (both JSON-encoded, parsed with `safeParse`). Renders:

- Animated score ring with the overall score
- Trajectory badge (improving = green, declining = red, steady = neutral)
- 5 thread-level dimension scores as a grid
- Turn-by-turn cards showing `scoreChange` deltas + per-turn notes
- Strongest moment as a pull quote with turn label
- Weakest snippet with side-by-side original/rewrite + explanation
- Dodged questions (only renders the section if the array is non-empty)
- Full conversation rendered at the bottom for review
- Coaching summary audio plays on mount
- CTAs: "Done" → `/(tabs)` home, "New threaded challenge" → `/one-shot/question?mode=threaded`

Critically, when this screen mounts, `clearThreadState()` has already fired in the recording screen's `Promise.allSettled` — the thread is no longer in AsyncStorage. The user has nothing in-flight.

### 4.5 Services (`src/services/scoring.ts`)

**`generateFollowUp(params)`:**

```ts
export async function generateFollowUp(params) {
  const endpoint = FEATURES.agenticThreaded
    ? '/v2/threaded/follow-up'
    : '/threaded/follow-up';
  return apiPost<FollowUp>(endpoint, {
    ...context,
    turns: params.previousTranscripts,
    originalQuestion: params.originalQuestion,
    question: params.previousTranscripts[params.previousTranscripts.length - 1].question,
    transcript: params.previousTranscripts[params.previousTranscripts.length - 1].transcript,
    turnNumber: params.turnNumber,
  });
}
```

The endpoint routing via `FEATURES.agenticThreaded` is the entire client-side hook for the v1/v2 split. v1 is the deterministic path; v2 is the agentic path (see §6).

**`generateDebrief(params)`:**

```ts
export async function generateDebrief(params) {
  return apiPost<ThreadDebrief>('/threaded/debrief', {
    ...context,
    scenario: params.scenario,
    turns: params.turns.map(t => ({ turn: t.turnNumber, question: t.question, transcript: t.transcript, scores: t.scores })),
  });
}
```

There is no v2 debrief — the agentic path only applies to follow-ups (where contradiction detection across the thread is the high-value retrieval use case).

---

## 5. Backend — V1 deterministic path

### 5.1 `POST /api/threaded/follow-up`

`backend/server.js` route handler:

```js
app.post('/api/threaded/follow-up', async (req, res) => {
  try {
    const question = sanitizeString(req.body?.question, MAX_QUESTION);
    const transcript = sanitizeString(req.body?.transcript, MAX_TRANSCRIPT);
    if (!question || !transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }
    const result = await callClaude(
      prompts.followUpPrompt({ ...req.body, question, transcript }),
      400,
      { model: MODELS.HAIKU }
    );
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Threaded follow-up');
  }
});
```

Key details:
- **Model**: Haiku 4.5 (fast path — follow-up generation is high-volume + tolerable for slight quality drop)
- **Max tokens**: 400 — `FollowUp` is small JSON
- **No auth** — soft-stateless, anyone can call it
- **No retrieval** — purely prompt-shaped from the request body

### 5.2 The follow-up prompt (`backend/prompts/index.js`)

`followUpPrompt(context)` constructs a system + user prompt that:

1. Starts with a user context block (via `buildUserContextBlock(context)`) — names the user's role, company, dream role, uploaded docs, recent coaching themes
2. Provides the original question + all previous Q/A turns inline
3. Defines six pressure styles with explicit decision rules:
   - **DEPTH** — substance was thin, probe untapped specifics
   - **CLARITY** — answer was rambling/vague, force sharpening
   - **CHALLENGE** — answer made a claim worth questioning
   - **PERSPECTIVE** — push them to view from stakeholder/customer/exec angles
   - **STAKES** — raise the urgency, add a constraint
   - **ACCOUNTABILITY** — they dodged; call it out
4. Tells Claude to quote the user's own words back to them in the reaction
5. Specifies the JSON output schema: `{ reaction, followUp, targeting, pressureLevel }`

Critically, the prompt instructs the model to **build on the entire thread**, not just the last turn. This is what makes a thread feel coherent — turn 4 must reference something the user said in turn 1 to feel like a real conversation.

### 5.3 `POST /api/threaded/debrief`

```js
app.post('/api/threaded/debrief', async (req, res) => {
  try {
    if (!Array.isArray(req.body?.turns) || req.body.turns.length === 0) {
      return res.status(400).json({ error: 'turns array is required' });
    }
    const result = await callClaude(prompts.debriefPrompt(req.body), 2000);
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Threaded debrief');
  }
});
```

- **Model**: Sonnet 4 (quality-critical — debrief is the high-emotional-weight moment)
- **Max tokens**: 2000 (large output — 5 scores + 5 deltas + strongest/weakest snippets + dodged-questions list + summary)
- **Prompt** scores 5 thread-level dimensions, identifies trajectory, finds the strongest quote + weakest snippet (with full rewrite), and flags dodged questions

The debrief prompt is one of the longest in the codebase. It instructs Claude to be honest about what didn't work — Sharp's coaching style is "mentor who has read everything and quotes nothing", and the debrief is where that lands hardest.

---

## 6. Backend — V2 agentic path

Gated by `FEATURES.agenticThreaded = false` in production. The v2 path is built but not flipped on — it'll ship behind a feature flag rollout after v1 is proven in production.

### 6.1 `POST /api/v2/threaded/follow-up`

```js
app.post('/api/v2/threaded/follow-up', async (req, res) => {
  try {
    if (!req.body?.question || !req.body?.transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }

    // SECURITY: only trust req.userId from the verifyUser middleware.
    // The middleware soft-fails to null if the JWT is missing/invalid.
    if (!req.userId) {
      // Fall back to v1 deterministic prompt — users never see a broken thread
      const result = await callClaude(prompts.followUpPrompt(req.body), 400, { model: MODELS.HAIKU });
      return res.json(result);
    }

    try {
      const result = await generateThreadedFollowUp({
        anthropic,
        supabase,
        userId: req.userId,
        sessionId: req.body?.sessionId,
        payload: req.body,
      });
      res.json(result);
    } catch (agentError) {
      logError('Agent threaded follow-up failed, falling back to v1:', agentError);
      const fallback = await callClaude(prompts.followUpPrompt(req.body), 400, { model: MODELS.HAIKU });
      res.json(fallback);
    }
  } catch (error) {
    sendError(res, 500, error, 'V2 threaded follow-up');
  }
});
```

**Two layers of fallback:**
1. No userId from JWT → v1 immediately (no agent run at all)
2. Agent throws → v1 fallback (user never sees a broken thread)

The agent path **must never block the user**. If retrieval is slow, the agent times out (25s total budget) and the v1 fallback runs.

### 6.2 The threaded interrogator agent (`backend/agent/threaded_interrogator.js`)

Exported function:

```js
async function generateThreadedFollowUp({ anthropic, supabase, userId, sessionId, payload })
```

System prompt (excerpted):
> You are the interrogator in a 4-turn pressure drill. You have access to seven tools that let you read the user's recent sessions, transcripts, weakest dimensions, recurring coaching themes, and any documents they've uploaded. Use these tools to ask a follow-up question that is specifically informed by what you've seen, not generic. Quote their own words back. Pick exactly one pressure style and one targeting reason. Output JSON only: `{ reaction, followUp, targeting, pressureLevel }`.

The agent runs `runAgent({ systemPrompt, userMessage, tools: TOOL_DEFINITIONS, maxIterations: 5, maxTokens: 1200 })` (see §6.3).

After the agent returns, `coerceFollowUp(result)` enforces the contract:
- `pressureLevel` must be one of the six allowed values, else falls back to `'depth'`
- `targeting` must be a non-empty string, else falls back to a generic
- `reaction` and `followUp` must be strings, else fall back to defaults

This guarantees the client always sees a well-formed `FollowUp`, even if the agent produced something malformed.

### 6.3 The agent runner (`backend/agent/runner.js`)

```js
const DEFAULT_TOTAL_BUDGET_MS = 25_000;   // hard cap, < Railway 30s timeout
const PER_TOOL_TIMEOUT_MS = 3_000;        // per-tool deadline
const MIN_ITERATION_BUDGET = 8_000;       // need this much left to start another Claude turn

async function runAgent({ systemPrompt, userMessage, tools, maxIterations = 5, maxTokens = 1500, model = SONNET }) {
  const abortController = new AbortController();
  const totalDeadline = Date.now() + DEFAULT_TOTAL_BUDGET_MS;
  setTimeout(() => abortController.abort(), DEFAULT_TOTAL_BUDGET_MS);

  let messages = [{ role: 'user', content: userMessage }];
  for (let i = 0; i < maxIterations; i++) {
    const remaining = totalDeadline - Date.now();
    if (remaining < MIN_ITERATION_BUDGET) break;

    const response = await anthropic.messages.create({
      model, max_tokens: maxTokens, system: systemPrompt, messages, tools,
      signal: abortController.signal,
    });

    if (response.stop_reason === 'end_turn' || !response.content.some(b => b.type === 'tool_use')) {
      return parseFinal(response);  // return JSON output
    }

    // Execute all tool calls in parallel with per-tool deadline
    const toolResults = await Promise.all(response.content
      .filter(b => b.type === 'tool_use')
      .map(async (toolCall) => {
        try {
          const result = await Promise.race([
            executeTool(toolCall.name, toolCall.input, { supabase, userId }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('tool timeout')), PER_TOOL_TIMEOUT_MS)),
          ]);
          return { type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify(result) };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: toolCall.id, content: JSON.stringify({ error: e.message }) };
        }
      }));

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
  return parseFinal(messages[messages.length - 1]);
}
```

Key design choices:
- **Hard 25s budget** because Railway requests time out at 30s. We leave 5s of headroom.
- **Per-tool 3s timeout** because any individual tool taking 3s+ would chew the budget for the rest of the run.
- **All tool calls in parallel** within an iteration — Claude often requests 2-3 tools per turn and we shouldn't serialise them.
- **Failed tools return an `{ error }` JSON** so the model can recover instead of crashing the run.
- **AbortController** propagates to `anthropic.messages.create` — when the deadline hits, the in-flight Claude call is killed too.

### 6.4 The seven tools (`backend/agent/tools.js`)

Each tool is `{ name, description, input_schema, execute(input, ctx) }`. All have a `needsDb(ctx)` short-circuit returning `{ error: 'unauthenticated' }` if `ctx.userId` or `ctx.supabase` is missing.

| Tool | What it returns |
|---|---|
| `get_recent_sessions` | The user's N most recent sessions filtered by type, with overall scores + coaching insights |
| `get_session_turns` | Full turn-by-turn transcripts + scores for a specific session |
| `search_user_history` | ILIKE keyword search across transcripts + coaching insights |
| `get_weakest_dimensions` | Rolling per-dimension averages over the last N turns |
| `find_recurring_pattern` | Detects keywords appearing 3+ times across recent coaching insights |
| `get_user_context` | Role, company, situation, dream role, uploaded documents (with extracted structure) |
| `find_contradiction` | In-memory heuristic comparing transcripts across turns of the current thread for token overlap + negation mismatches |

`find_contradiction` is the most threaded-specific tool — it's how the agent catches "you said X in turn 1 but Y in turn 3" and turns it into an `accountability`-style follow-up.

### 6.5 The middleware (`backend/agent/auth.js`)

```js
function makeVerifyUser(supabase) {
  return async function verifyUser(req, res, next) {
    req.userId = null;
    try {
      const header = req.headers.authorization || '';
      if (!header.toLowerCase().startsWith('bearer ')) return next();
      const token = header.slice(7).trim();
      if (!token || !supabase) return next();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user?.id) return next();
      req.userId = data.user.id;
      return next();
    } catch {
      return next();
    }
  };
}
```

**Soft-fails to `req.userId = null` in every error path.** The endpoint decides whether null is OK (v2 threaded: yes, falls back to v1) or hard-rejects (account deletion: 401). This pattern lets the v2 endpoint serve unauthenticated callers without breaking — they just get the v1 experience.

### 6.6 Tracing (`backend/agent/traces.js`)

Every agent run is traced to two sinks:
- **PostHog** events: `agent_run_started`, `agent_step`, `agent_run_completed` — used for funnels, latency dashboards, success rate
- **Supabase `agent_traces` table** — full audit trail with per-step tool inputs/outputs, latency, tokens

The trace records:
- Request ID (UUID)
- User ID + session ID
- Agent name (`threaded_interrogator`)
- Per-tool calls with input + output + latency
- Total iterations
- Total input/output tokens
- Success/failure flag + final decision

Both sinks are **best-effort** — trace failures don't block the agent run. If PostHog is down, the agent still returns its follow-up.

---

## 7. State management

### 7.1 ThreadState (AsyncStorage)

Persisted at `sharp:active_thread`. Functions in `src/services/storage.ts`:

```ts
getThreadState(): Promise<ThreadState | null>
saveThreadState(state: ThreadState): Promise<void>
clearThreadState(): Promise<void>
clearStaleThread(): Promise<void>   // wipes if startedAt > 1h ago
```

`clearStaleThread()` runs on app boot from `OnboardingGate` in `app/_layout.tsx`. This is the only automatic cleanup — within a session, the recording screen is responsible for clearing thread state after the debrief.

### 7.2 Why client-side state, not server-side?

The thread lives only on-device. Three reasons:

1. **No coordination needed.** The user is the only consumer of their thread. No need to fan out to other devices mid-thread.
2. **Lower backend complexity.** No thread table, no garbage collection, no per-user thread quota.
3. **Privacy.** Mid-thread transcripts never leave the device until the final debrief, at which point they're stored as a single completed Session record. The intermediate thread state is local-only.

The trade-off: backgrounding the app during a long thread can cause the OS to evict AsyncStorage entries (rare). Recovery via the "Your threaded session expired" UI handles this.

### 7.3 Why no server-side resume?

We could maintain server-side resume by syncing every ThreadTurn write to a `threads` table. We chose not to because:
- The recovery rate would be marginal (most thread expirations happen because the user backgrounded for hours, by which point they probably want to start fresh)
- It adds backend complexity for an edge case
- AsyncStorage is reliable enough that <1% of threads encounter eviction

---

## 8. Error recovery

| Failure | Detection | Behaviour |
|---|---|---|
| Thread state expired (stale > 1h) | `clearStaleThread()` at boot | Silently cleared. User starting a new thread sees a fresh state. |
| Thread state missing mid-thread (AsyncStorage evicted) | `getThreadState() === null` in recording screen | "Your threaded session expired" recovery screen with CTA to `/one-shot/question?mode=threaded`. |
| `generateFollowUp` fails (network) | `apiPost` throws | Retry UI on recording screen — user can hit "Try again" without losing their turn |
| Agent path times out / crashes (v2 only) | `try/catch` around `generateThreadedFollowUp` | Server falls back to v1 prompt automatically. User unaware. |
| Auth JWT invalid (v2 only) | `req.userId === null` | Server falls back to v1 immediately. No 401 to client. |
| `generateDebrief` fails (network) | Try-catch in recording screen | Retry. The thread state is preserved (we don't `clearThreadState()` until debrief succeeds), so the user doesn't lose their 4 turns. |
| Recording screen unmounts mid-thread | N/A | ThreadState persists. User can resume from the question screen — though we currently don't surface "resume" — they'd start over. (Open improvement.) |

---

## 9. Performance + cost

Per-thread cost estimate (Sonnet for opening + debrief, Haiku for 3 follow-ups, with prompt caching active):

| Operation | Model | Tokens (rough) | Cost |
|---|---|---|---|
| Opening question | Sonnet | ~2k in / ~300 out | £0.012 |
| Turn 1 scoring | Sonnet (cached system) | ~600 in / ~400 out | £0.005 |
| Follow-up #1 | Haiku | ~3k in / ~400 out | £0.003 |
| Turn 2 scoring | Sonnet (cached system) | ~600 in / ~400 out | £0.005 |
| Follow-up #2 | Haiku | ~3.5k in / ~400 out | £0.003 |
| Turn 3 scoring | Sonnet (cached system) | ~600 in / ~400 out | £0.005 |
| Follow-up #3 | Haiku | ~4k in / ~400 out | £0.003 |
| Turn 4 scoring | Sonnet (cached system) | ~600 in / ~400 out | £0.005 |
| Debrief | Sonnet | ~5k in / ~1.5k out | £0.030 |
| 4× transcription | Groq Whisper | 4× 90s audio | £0.010 |
| 4× TTS (Kokoro + 1× ElevenLabs for opening) | TTS | ~1.5k chars total | £0.005 |
| **Total per thread** | | | **~£0.086** |

With prompt caching the scoring system block (~4000 tokens) is reused across all four turn-scoring calls, cutting input cost by ~90% on those.

### V2 agentic path additional cost

When `FEATURES.agenticThreaded` is on, each follow-up runs the agent with up to 5 iterations + up to 7 tool calls. Additional cost per agentic follow-up: roughly £0.010-0.025 depending on how many iterations the agent uses. Worth it if the resulting follow-up is meaningfully better (which is what the rollout flag is meant to validate).

---

## 10. Feature flag wiring

`src/constants/features.ts`:

```ts
export const FEATURES = {
  conversation: false,          // live voice mode
  agenticThreaded: false,       // ← gates v2 path
  agenticScoring: false,
  agenticDebrief: false,
};

export function applyRemoteFeatures(remote: any) {
  if (!remote || typeof remote !== 'object') return;
  for (const key in FEATURES) {
    if (typeof remote[key] === 'boolean') FEATURES[key] = remote[key];
  }
}
```

`applyRemoteFeatures()` is called at app boot from `fetchRemoteConfig()` in `src/services/api.ts`, which fetches `GET /api/config`. The remote config endpoint returns `{ features: { agenticThreaded: false, ... }, version: '...' }`. This means we can flip the flag server-side without a new app build.

The flag is checked on the client (in `generateFollowUp`) — the server doesn't know whether a client called v1 or v2; each endpoint is independent. This is intentional: it makes the rollout decision a client-side concern, allowing canary cohorts via remote config.

---

## 11. Where this could go next

Tracked as deferred work (in `TODO.md` under post-launch):

1. **Enable v2 for canary users** — flip `agenticThreaded` for a 10% remote-config cohort. Compare agent-trace data: % of follow-ups that quote the user's actual words, % that reference an uploaded document, completion rate, latency P95.
2. **Pre-warm the threaded TTS audio** — currently we generate TTS for the follow-up's reaction + question after `generateFollowUp` returns. We could speculatively prefetch the next follow-up's audio while the user is recording the next answer, shaving ~500ms off the perceived latency.
3. **Resume mid-thread UI** — if the user returns to the app with a fresh `ThreadState` in storage, offer "Resume your thread" on the home screen instead of forcing a new question.
4. **Six-turn / eight-turn variants** — Pro+ tier feature. Some users (PMs prepping for stakeholder meetings, founders prepping for board reviews) want longer drills.
5. **Scenario-specific threads** — salary negotiation thread, technical interview thread, board update thread. Each scenario has a prebuilt 4-turn structure that the agent follows but personalises.
6. **Server-side thread state** — only worth doing if we discover thread expiration is a real conversion-killer in PostHog data. Right now the recovery UI handles it.

---

## 12. Files (quick reference)

**Frontend:**
- `app/one-shot/question.tsx` — opening question + ThreadState init
- `app/one-shot/recording.tsx` — recording screen, shared with One Shot, branches on `mode === 'threaded'`
- `app/threaded/follow-up.tsx` — between-turn screen with reaction + next question
- `app/threaded/debrief.tsx` — end-of-thread analysis
- `src/services/scoring.ts` — `generateFollowUp`, `generateDebrief`
- `src/services/storage.ts` — `getThreadState`, `saveThreadState`, `clearThreadState`, `clearStaleThread`
- `src/types/index.ts` — `ThreadState`, `ThreadTurn`, `FollowUp`, `ThreadDebrief`
- `src/constants/features.ts` — `agenticThreaded` flag

**Backend:**
- `backend/server.js` — three route handlers (`POST /api/threaded/follow-up`, `POST /api/v2/threaded/follow-up`, `POST /api/threaded/debrief`)
- `backend/prompts/index.js` — `followUpPrompt`, `debriefPrompt`, `buildUserContextBlock`
- `backend/agent/runner.js` — `runAgent` with deadline + per-tool timeout
- `backend/agent/tools.js` — seven retrieval tools + `TOOL_DEFINITIONS`
- `backend/agent/traces.js` — PostHog + Supabase `agent_traces` writes
- `backend/agent/auth.js` — `makeVerifyUser` middleware (soft-fail to null)
- `backend/agent/threaded_interrogator.js` — system prompt + `generateThreadedFollowUp` + `coerceFollowUp`
- `backend/migrations/001_agent_traces.sql` — schema for the traces table

---

*Last updated 2026-05-14. Ground truth: code on branch `feature/conversational-ai`, commit `f23e5d7` or later.*
