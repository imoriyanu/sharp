// Sharp AI — Agent tool layer.
// Tools are the moat: agents reason over typed objects (sessions, turns, scores, docs)
// not raw text. Each tool is a thin Supabase query returning a small JSON-serialisable
// structure. Every agent gets the same tool box; agents differ only in system prompts.

const MAX_TURNS_PER_QUERY = 200;
const MAX_TRANSCRIPT_LEN = 600; // truncate when returning many rows
const DEFAULT_RECENT_LIMIT = 10;

// Guards every retrieval tool. Service role + null userId would scan the whole
// table — short-circuit instead. Missing supabase client (env vars unset)
// returns empty so the agent reasons over inline context only.
function needsDb(ctx) {
  return !!(ctx && ctx.supabase && ctx.userId);
}

// ===== Tool implementations =====
// All take `{ supabase, userId }` as the first arg (injected by the runner)
// + a `args` object with tool-specific input.

async function get_recent_sessions(ctx, args) {
  if (!needsDb(ctx)) return { sessions: [], reason: 'unauthenticated' };
  const { supabase, userId } = ctx;
  const limit = Math.min(Math.max(args?.limit || DEFAULT_RECENT_LIMIT, 1), 30);
  const type = args?.type || null;

  let query = supabase
    .from('sessions')
    .select('id, type, scenario, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) query = query.eq('type', type);

  const { data: sessions, error } = await query;
  if (error || !sessions?.length) return { sessions: [] };

  // Get the overall score per session (max overall across turns is fine for a summary)
  const ids = sessions.map(s => s.id);
  const { data: turns } = await supabase
    .from('turns')
    .select('session_id, turn_number, overall, scores, coaching_insight, snippet')
    .in('session_id', ids);

  const turnsBySession = new Map();
  for (const t of turns || []) {
    const arr = turnsBySession.get(t.session_id) || [];
    arr.push(t);
    turnsBySession.set(t.session_id, arr);
  }

  return {
    sessions: sessions.map(s => {
      const ts = (turnsBySession.get(s.id) || []).sort((a, b) => a.turn_number - b.turn_number);
      const finalTurn = ts[ts.length - 1];
      return {
        sessionId: s.id,
        type: s.type,
        scenario: s.scenario?.slice(0, 200) || '',
        createdAt: s.created_at,
        turnCount: ts.length,
        overall: finalTurn?.overall ?? null,
        weakestSnippet: finalTurn?.snippet?.original?.slice(0, 200) || null,
        coachingInsight: finalTurn?.coaching_insight?.slice(0, 280) || null,
      };
    }),
  };
}

async function get_session_turns(ctx, args) {
  if (!needsDb(ctx)) return { turns: [], reason: 'unauthenticated' };
  if (!args?.session_id) return { error: 'session_id required' };
  const { supabase, userId } = ctx;
  const { data, error } = await supabase
    .from('turns')
    .select('turn_number, question, transcript, scores, overall, coaching_insight, snippet')
    .eq('user_id', userId)
    .eq('session_id', args.session_id)
    .order('turn_number', { ascending: true });
  if (error || !data?.length) return { turns: [] };
  return {
    turns: data.map(t => ({
      turn: t.turn_number,
      question: t.question?.slice(0, 400) || '',
      transcript: t.transcript?.slice(0, 1200) || '',
      overall: t.overall,
      scores: t.scores,
      coachingInsight: t.coaching_insight?.slice(0, 280) || null,
    })),
  };
}

async function search_user_history(ctx, args) {
  if (!needsDb(ctx)) return { matches: [], reason: 'unauthenticated' };
  if (!args?.query || typeof args.query !== 'string') return { matches: [] };
  const term = args.query.trim().slice(0, 100);
  if (!term) return { matches: [] };
  const { supabase, userId } = ctx;

  // Postgres ILIKE — fast enough for MVP volumes (< 1000 turns/user)
  // Search both transcripts and coaching insights.
  const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`;
  const { data, error } = await supabase
    .from('turns')
    .select('session_id, turn_number, question, transcript, coaching_insight, overall, created_at')
    .eq('user_id', userId)
    .or(`transcript.ilike.${pattern},coaching_insight.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error || !data?.length) return { matches: [] };
  return {
    matches: data.map(t => ({
      sessionId: t.session_id,
      turn: t.turn_number,
      question: t.question?.slice(0, 200) || '',
      excerpt: extractExcerpt(t.transcript || t.coaching_insight || '', term, 240),
      coachingInsight: t.coaching_insight?.slice(0, 200) || null,
      overall: t.overall,
      date: t.created_at,
    })),
  };
}

async function get_weakest_dimensions(ctx, args) {
  if (!needsDb(ctx)) return { dimensions: null, sampleSize: 0, reason: 'unauthenticated' };
  const { supabase, userId } = ctx;
  const lookback = Math.min(Math.max(args?.lookback || 10, 1), 50);
  const { data, error } = await supabase
    .from('turns')
    .select('scores, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(lookback);
  if (error || !data?.length) return { dimensions: null, sampleSize: 0 };

  const dims = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'];
  const sums = Object.fromEntries(dims.map(d => [d, { total: 0, count: 0 }]));
  for (const t of data) {
    const s = t.scores || {};
    for (const d of dims) {
      const v = typeof s[d] === 'number' ? s[d] : null;
      if (v != null) { sums[d].total += v; sums[d].count += 1; }
    }
  }
  const averages = {};
  for (const d of dims) {
    averages[d] = sums[d].count > 0 ? Math.round((sums[d].total / sums[d].count) * 10) / 10 : null;
  }
  const ranked = dims
    .filter(d => averages[d] != null)
    .sort((a, b) => averages[a] - averages[b]);
  return {
    sampleSize: data.length,
    averages,
    weakest: ranked[0] || null,
    weakestScore: ranked[0] ? averages[ranked[0]] : null,
    strongest: ranked[ranked.length - 1] || null,
  };
}

async function find_recurring_pattern(ctx, args) {
  if (!needsDb(ctx)) return { patterns: [], reason: 'unauthenticated' };
  const { supabase, userId } = ctx;
  const lookback = Math.min(Math.max(args?.lookback || 10, 1), 30);
  const { data, error } = await supabase
    .from('turns')
    .select('coaching_insight, created_at')
    .eq('user_id', userId)
    .not('coaching_insight', 'is', null)
    .order('created_at', { ascending: false })
    .limit(lookback);
  if (error || !data?.length) return { patterns: [] };

  // Lightweight keyword frequency over coaching insights
  const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that', 'these', 'those', 'you', 'your', 'yours', 'they', 'them', 'their', 'i', 'me', 'my', 'we', 'us', 'our', 'it', 'its', 'on', 'in', 'at', 'to', 'from', 'of', 'for', 'with', 'as', 'by', 'so', 'if', 'when', 'where', 'how', 'why', 'what', 'who', 'than', 'then', 'there', 'here', 'just', 'one', 'two', 'three', 'too', 'very', 'really', 'some', 'any', 'every', 'all', 'no', 'not', 'about']);
  const counts = new Map();
  for (const row of data) {
    const words = (row.coaching_insight || '').toLowerCase().match(/\b[a-z][a-z'-]{2,}\b/g) || [];
    const seen = new Set();
    for (const w of words) {
      if (stopwords.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const recurring = [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count, occurrenceRate: Math.round((count / data.length) * 100) / 100 }));

  return {
    sampleSize: data.length,
    patterns: recurring,
    recentInsights: data.slice(0, 5).map(r => r.coaching_insight),
  };
}

async function get_user_context(ctx, _args) {
  if (!needsDb(ctx)) return { context: null, documents: [], reason: 'unauthenticated' };
  const { supabase, userId } = ctx;
  const [{ data: userCtx }, { data: docs }] = await Promise.all([
    supabase.from('user_context').select('role_text, current_company, situation_text, dream_role_and_company').eq('user_id', userId).maybeSingle(),
    supabase.from('documents').select('filename, document_type, document_subtype, summary, structured_extraction').eq('user_id', userId).limit(10),
  ]);

  return {
    context: userCtx ? {
      role: userCtx.role_text || null,
      company: userCtx.current_company || null,
      situation: userCtx.situation_text || null,
      dreamRole: userCtx.dream_role_and_company || null,
    } : null,
    documents: (docs || []).map(d => ({
      filename: d.filename,
      type: d.document_type,
      subtype: d.document_subtype,
      summary: d.summary?.slice(0, 400) || null,
      extraction: d.structured_extraction || null,
    })),
  };
}

// In-memory tool — does not need supabase. Useful inside the same session.
async function find_contradiction(_ctx, args) {
  const turns = Array.isArray(args?.turns) ? args.turns : [];
  if (turns.length < 2) return { contradictions: [] };
  // Simple heuristic: token-set overlap + negation marker check.
  // Surfaces candidate pairs; agent decides if real.
  const findings = [];
  for (let i = 0; i < turns.length; i++) {
    for (let j = i + 1; j < turns.length; j++) {
      const a = (turns[i].transcript || '').toLowerCase();
      const b = (turns[j].transcript || '').toLowerCase();
      if (!a || !b) continue;
      const aTokens = new Set(a.match(/\b[a-z]{4,}\b/g) || []);
      const bTokens = new Set(b.match(/\b[a-z]{4,}\b/g) || []);
      const shared = [...aTokens].filter(t => bTokens.has(t));
      const aHasNeg = /\b(no|not|never|wasn't|didn't|won't|don't)\b/.test(a);
      const bHasNeg = /\b(no|not|never|wasn't|didn't|won't|don't)\b/.test(b);
      if (shared.length >= 4 && aHasNeg !== bHasNeg) {
        findings.push({
          turnA: turns[i].turn || i + 1,
          turnB: turns[j].turn || j + 1,
          sharedTopics: shared.slice(0, 6),
          excerptA: (turns[i].transcript || '').slice(0, 200),
          excerptB: (turns[j].transcript || '').slice(0, 200),
        });
      }
    }
  }
  return { contradictions: findings.slice(0, 3) };
}

// ===== Tool definitions for Claude =====
// JSON schemas Claude sees. Names match the executor switch below.

const TOOL_DEFINITIONS = [
  {
    name: 'get_recent_sessions',
    description: 'Returns the user\'s most recent practice sessions with overall scores and coaching insights. Use this to spot recurring weaknesses, see how they\'ve performed in similar scenarios, or check whether they\'ve discussed a topic before.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'How many recent sessions to fetch (default 10, max 30)', minimum: 1, maximum: 30 },
        type: { type: 'string', enum: ['daily_30', 'one_shot', 'threaded', 'duel', 'conversation'], description: 'Optional: filter to one session type' },
      },
    },
  },
  {
    name: 'get_session_turns',
    description: 'Returns the full turn-by-turn transcripts and scores for a specific past session. Use after get_recent_sessions when you want to drill into what they actually said.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'The session ID from get_recent_sessions' } },
      required: ['session_id'],
    },
  },
  {
    name: 'search_user_history',
    description: 'Keyword search across the user\'s past transcripts and coaching insights. Use to check if they\'ve previously talked about a specific topic, dodged a similar question, or received related coaching.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keyword or short phrase. Single concept works best.' } },
      required: ['query'],
    },
  },
  {
    name: 'get_weakest_dimensions',
    description: 'Returns rolling per-dimension averages over the user\'s last N sessions. Tells you which of structure/concision/substance/fillerWords/awareness is their weakest area.',
    input_schema: {
      type: 'object',
      properties: { lookback: { type: 'integer', description: 'How many recent turns to average over (default 10, max 50)', minimum: 1, maximum: 50 } },
    },
  },
  {
    name: 'find_recurring_pattern',
    description: 'Surfaces words that recur across the user\'s recent coaching insights — useful to detect "third time this week you\'ve buried the lead" patterns before issuing the same advice again.',
    input_schema: {
      type: 'object',
      properties: { lookback: { type: 'integer', description: 'How many recent insights to scan (default 10, max 30)', minimum: 1, maximum: 30 } },
    },
  },
  {
    name: 'get_user_context',
    description: 'Returns the user\'s self-described role, company, situation, dream role, and any uploaded documents (CV, job descriptions, etc). Use this when probing CV claims or tying a question back to their world.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_contradiction',
    description: 'Heuristically surfaces candidate contradictions WITHIN the current threaded session by comparing turn transcripts. Use during a threaded follow-up when you want to call out an inconsistency.',
    input_schema: {
      type: 'object',
      properties: {
        turns: {
          type: 'array',
          description: 'Array of { turn, transcript } from the current session',
          items: {
            type: 'object',
            properties: { turn: { type: 'integer' }, transcript: { type: 'string' } },
          },
        },
      },
      required: ['turns'],
    },
  },
];

// ===== Executor =====
// Used by the runner to dispatch by tool name.

const EXECUTORS = {
  get_recent_sessions,
  get_session_turns,
  search_user_history,
  get_weakest_dimensions,
  find_recurring_pattern,
  get_user_context,
  find_contradiction,
};

async function executeTool(name, input, ctx) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return await fn(ctx, input || {});
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

// ===== Helpers =====

function extractExcerpt(text, term, maxLen) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, idx - Math.floor(maxLen / 2));
  const end = Math.min(text.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  EXECUTORS, // exported for testing
};
