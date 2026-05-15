require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const prompts = require('./prompts');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const { createClient } = require('@supabase/supabase-js');
const { generateThreadedFollowUp } = require('./agent/threaded_interrogator');
const { makeVerifyUser } = require('./agent/auth');
const agentTraces = require('./agent/traces');
const log = process.env.NODE_ENV === 'production' ? () => {} : console.log.bind(console);
const logError = console.error.bind(console); // always log errors
const isProd = process.env.NODE_ENV === 'production';

function sendError(res, status, error, context) {
  logError(`${context}:`, error);
  res.status(status).json({ error: isProd ? 'Something went wrong. Please try again.' : error.message || error });
}

// Validate required API keys before starting
const REQUIRED_KEYS = ['ANTHROPIC_API_KEY', 'GROQ_API_KEY'];
for (const key of REQUIRED_KEYS) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable ${key}`);
    process.exit(1);
  }
}

// Supabase admin client (for webhook server-side updates)
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const app = express();

// Security headers — relaxed for API server (no HTML served)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));

// CORS — restrict to known origins in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : (isProd ? [] : ['http://localhost:8081', 'http://localhost:19006', 'exp://']);
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + '/'))) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '25mb' }));

// Rate limiting — per IP, with periodic cleanup
const rateLimits = new Map();
const RATE_WINDOW = 60000;

// Clean expired entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    const recent = v.filter(t => now - t < RATE_WINDOW);
    if (recent.length === 0) rateLimits.delete(k);
    else rateLimits.set(k, recent);
  }
}, 120000).unref();

function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const hits = rateLimits.get(key) || [];
    const recent = hits.filter(t => now - t < RATE_WINDOW);
    if (recent.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    recent.push(now);
    rateLimits.set(key, recent);
    next();
  };
}

// Apply rate limits — generous for normal use, strict for expensive endpoints
app.use('/api/question', rateLimit(10));   // 10 question generations per minute
app.use('/api/score', rateLimit(10));       // 10 scorings per minute
app.use('/api/threaded', rateLimit(15));    // 15 threaded calls per minute
app.use('/api/transcribe', rateLimit(10));  // 10 transcriptions per minute
app.use('/api/tts', rateLimit(20));         // 20 TTS calls per minute
app.use('/api/progress', rateLimit(5));     // 5 progress summaries per minute
app.use('/api/analytics', rateLimit(3));    // 3 pattern extractions per minute (Sonnet, cached client-side)
app.use('/api/conversation', rateLimit(20)); // 20 conversation calls per minute (fast back-and-forth)
app.use('/api/v2/threaded', rateLimit(15)); // mirror v1 limits for the agentic variant
app.use('/api/v2/score', rateLimit(10));

// JWT verification for v2 endpoints — sets req.userId from a verified Bearer token.
// Soft-fails (req.userId = null) so the endpoint can fall back to the v1 prompt.
app.use('/api/v2', makeVerifyUser(supabase));

// Same middleware on /api/account — but the handler enforces 401 if userId is null
// (deletion is irreversible, must be auth-gated for real).
app.use('/api/account', makeVerifyUser(supabase));

// ===== API Usage Monitoring =====

const apiUsage = {
  anthropic: { calls: 0, inputTokens: 0, outputTokens: 0, errors: 0, lastReset: new Date().toISOString() },
  groq: { calls: 0, errors: 0, lastReset: new Date().toISOString() },
  elevenlabs: { calls: 0, characters: 0, errors: 0, lastReset: new Date().toISOString() },
};

function resetUsageIfNewDay() {
  const today = new Date().toISOString().split('T')[0];
  for (const service of Object.values(apiUsage)) {
    if (service.lastReset.split('T')[0] !== today) {
      Object.keys(service).forEach(k => { if (k !== 'lastReset') service[k] = 0; });
      service.lastReset = new Date().toISOString();
    }
  }
}

// ===== Input Validation =====

const MAX_TRANSCRIPT = 50000;
const MAX_QUESTION = 2000;
const MAX_TTS_TEXT = 3000;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB

function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen);
}

// ===== API Clients =====

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const groq = new Groq.default({
  apiKey: process.env.GROQ_API_KEY,
});

// ===== Helper: Call Claude =====
// MODELS — Sonnet for quality-critical paths (scoring, debrief, agent tool
// use, document parse). Haiku 4.5 for fast/formulaic paths (question gen,
// follow-up, quality gate, progress summary, conversation, engagement
// nudges). Haiku is ~12× cheaper input + output, ~3-5× faster.
const MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  HAIKU:  'claude-haiku-4-5-20251001',
};

// timeoutMs default 30s; callers that need longer (industry research, threaded
// follow-up with potential regen, debrief on Sonnet) override per call.
async function callClaude(prompt, maxTokens = 1500, { cacheSystem, model = MODELS.SONNET, timeoutMs = 30000 } = {}) {
  resetUsageIfNewDay();
  apiUsage.anthropic.calls++;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // If cacheSystem provided, send it as a cached system block (~90% input
    // cost reduction for the static scoring prompt).
    const createOpts = cacheSystem
      ? {
          model,
          max_tokens: maxTokens,
          system: [{ type: 'text', text: cacheSystem, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt }],
        }
      : {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        };
    const response = await anthropic.messages.create(createOpts, { signal: controller.signal }).finally(() => clearTimeout(timeout));

    // Track token usage
    if (response.usage) {
      apiUsage.anthropic.inputTokens += response.usage.input_tokens || 0;
      apiUsage.anthropic.outputTokens += response.usage.output_tokens || 0;
    }

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response — robust extraction. Logs which phase failed so we
    // can debug "Invalid JSON" reports in production. Throws a typed error
    // (code: CLAUDE_PARSE_FAILURE) so endpoints can decide whether to retry.
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch {}
      }
      logError(`Claude JSON parse failure — model=${model}, length=${cleaned.length}, first500=${cleaned.slice(0, 500)}`);
      const err = new Error('CLAUDE_PARSE_FAILURE');
      err.code = 'CLAUDE_PARSE_FAILURE';
      err.raw = cleaned.slice(0, 1000);
      throw err;
    }
  } catch (e) {
    apiUsage.anthropic.errors++;
    // Tag aborts so callers can distinguish timeout from parse failure.
    if (e?.name === 'AbortError' && !e.code) {
      e.code = 'CLAUDE_TIMEOUT';
    }
    throw e;
  }
}

// ===== Health Check =====

app.get('/api/health', (req, res) => {
  resetUsageIfNewDay();
  res.json({
    status: 'ok',
    services: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    },
  });
});

// ===== Remote Config =====
// Mobile clients fetch this at app start (cached for the session) to decide
// which v2 features are live. Lets us roll out / roll back agent endpoints
// without an App Store update.

app.get('/api/config', (req, res) => {
  // Default off in code so a misconfigured deploy never silently breaks v1 callers.
  // Flip individual flags via env vars, or replace this with a DB lookup later.
  const features = {
    agenticThreaded: process.env.FEATURE_AGENTIC_THREADED === 'on',
    agenticScoring: process.env.FEATURE_AGENTIC_SCORING === 'on',
    agenticDebrief: process.env.FEATURE_AGENTIC_DEBRIEF === 'on',
  };
  res.json({ features, version: 1 });
});

// ===== API Usage Monitoring =====

app.get('/api/usage', (req, res) => {
  resetUsageIfNewDay();
  res.json({
    date: new Date().toISOString().split('T')[0],
    anthropic: {
      calls: apiUsage.anthropic.calls,
      inputTokens: apiUsage.anthropic.inputTokens,
      outputTokens: apiUsage.anthropic.outputTokens,
      totalTokens: apiUsage.anthropic.inputTokens + apiUsage.anthropic.outputTokens,
      errors: apiUsage.anthropic.errors,
      estimatedCostUSD: Math.round(((apiUsage.anthropic.inputTokens * 3 + apiUsage.anthropic.outputTokens * 15) / 1_000_000) * 100) / 100,
    },
    groq: {
      calls: apiUsage.groq.calls,
      errors: apiUsage.groq.errors,
    },
    elevenlabs: {
      calls: apiUsage.elevenlabs.calls,
      characters: apiUsage.elevenlabs.characters,
      errors: apiUsage.elevenlabs.errors,
    },
  });
});

// ===== Helper: Call Claude with Tool Use =====

async function callClaudeWithTools(systemPrompt, userMessage, tools, maxIterations = 5) {
  resetUsageIfNewDay();
  const messages = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < maxIterations; i++) {
    apiUsage.anthropic.calls++;
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages,
        tools,
      });

      if (response.usage) {
        apiUsage.anthropic.inputTokens += response.usage.input_tokens || 0;
        apiUsage.anthropic.outputTokens += response.usage.output_tokens || 0;
      }

      // Check if Claude wants to use tools
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const textBlocks = response.content.filter(b => b.type === 'text');

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        // No more tool calls — extract final text/JSON
        const text = textBlocks.map(b => b.text).join('');
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        try { return JSON.parse(cleaned); } catch {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) try { return JSON.parse(jsonMatch[0]); } catch {}
          return { text: cleaned };
        }
      }

      // Execute tool calls in parallel
      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        const result = await executeTool(block.name, block.input);
        return { type: 'tool_result', tool_use_id: block.id, content: typeof result === 'string' ? result : JSON.stringify(result) };
      }));

      // Continue the conversation
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    } catch (e) {
      apiUsage.anthropic.errors++;
      throw e;
    }
  }
  throw new Error('Max tool iterations reached');
}

async function executeTool(name, input) {
  switch (name) {
    case 'search_news': return await searchGoogleNews(input.query);
    default: return `Unknown tool: ${name}`;
  }
}

// ===== Agentic News Research for Industry Questions =====

async function searchGoogleNews(query) {
  try {
    const encoded = encodeURIComponent(query);
    const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'Sharp/1.0' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const xml = await response.text();
    // Extract items with title + link + source
    const items = [];
    const itemBlocks = xml.split('<item>').slice(1);
    for (const block of itemBlocks.slice(0, 10)) {
      const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/);
      const linkMatch = block.match(/<link>(.*?)<\/link>/);
      const sourceMatch = block.match(/<source.*?>(.*?)<\/source>/);
      const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);
      if (titleMatch && titleMatch[1].length > 20 && titleMatch[1] !== 'Google News') {
        items.push({
          title: titleMatch[1].trim(),
          url: linkMatch ? linkMatch[1].trim() : null,
          source: sourceMatch ? sourceMatch[1].trim() : null,
          date: pubDateMatch ? pubDateMatch[1].trim() : null,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function agentResearchNews(context) {
  // Fast approach: Claude picks 4 queries, we search in parallel, return results
  const planPrompt = `You are a research agent. Generate 4 DIVERSE news search queries for this user.

Role: ${context.roleText || 'Not specified'}
Company: ${context.currentCompany || 'Not specified'}
Situation: ${context.situationText || 'Not specified'}

Previous questions (avoid similar): ${(context.recentQuestions || []).slice(0, 5).map(q => `"${q}"`).join(', ') || 'None'}

Return ONLY JSON: { "queries": ["query1", "query2", "query3", "query4"] }`;

  try {
    const plan = await callClaude(planPrompt, 200, { model: MODELS.HAIKU });
    if (!plan?.queries?.length) return [];

    // Search all 4 in parallel — fast
    const results = await Promise.all(
      plan.queries.slice(0, 4).map(q => searchGoogleNews(q))
    );

    // Combine, dedupe, label
    const seen = new Set();
    const unique = [];
    plan.queries.forEach((query, i) => {
      for (const item of (results[i] || [])) {
        if (!seen.has(item.title)) {
          seen.add(item.title);
          unique.push({ ...item, searchAngle: query });
        }
      }
    });

    return unique.slice(0, 20);
  } catch (e) {
    logError('Agent research error:', e);
    return [];
  }
}

// ===== Universal Daily Question (shared across all users for the day) =====
// One question per day, generated server-side once, cached in memory until
// midnight UTC. Cheaper than per-user generation and enables Duels.

let dailyQuestionCache = { date: '', question: null };
// Promise lock — when the cache is cold, only one request actually calls
// Claude; concurrent requests await the same promise. Avoids N duplicate
// generations when N users open the app at the new-day boundary.
let dailyQuestionPromise = null;

const DAILY_QUESTION_FALLBACK = {
  question: "What's the most important lesson you've learned in your career so far, and how has it changed how you work?",
  format: 'prompt',
  timerSeconds: 60,
  reasoning: 'Universal fallback',
  targets: 'substance',
  difficulty: 5,
  contextUsed: [],
};

async function generateDailyQuestion(today) {
  const prompt = `You are Sharp, a communication coach. Generate ONE universal daily challenge question that ANY professional can answer — regardless of their role, industry, or experience level.

The question should test communication skills: clarity, structure, concision, or substance. It should be thought-provoking and require a genuine spoken response — not a yes/no answer.

VARIETY — rotate between these styles:
- Opinion questions ("What's your take on...?")
- Experience questions ("Tell me about a time when...")
- Hypothetical scenarios ("Your CEO just announced... how do you respond?")
- Explain-it questions ("Explain [concept] to someone outside your field")
- Pitch questions ("Convince me that...")
- Pressure questions ("You have 30 seconds to...")

Today's date: ${today} (use this as a seed for variety — different day = different style)

Return ONLY JSON:
{
  "question": "The question text",
  "format": "prompt",
  "timerSeconds": 60,
  "reasoning": "Why this question tests communication skills",
  "targets": "which dimension this primarily tests (structure/concision/substance)",
  "difficulty": 5,
  "contextUsed": []
}`;

  const result = await callClaude(prompt, 500);
  if (!result?.question) throw new Error('Invalid question response');
  dailyQuestionCache = { date: today, question: result };
  return result;
}

app.get('/api/daily-question', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (dailyQuestionCache.date === today && dailyQuestionCache.question) {
      return res.json(dailyQuestionCache.question);
    }

    if (!dailyQuestionPromise) {
      dailyQuestionPromise = generateDailyQuestion(today)
        .finally(() => { dailyQuestionPromise = null; });
    }
    const result = await dailyQuestionPromise;
    res.json(result);
  } catch (error) {
    logError('Daily question:', error?.message || error);
    res.json(DAILY_QUESTION_FALLBACK);
  }
});

// ===== Question Engine =====

// Required output fields for a question. Threaded mode breaks silently if any
// of these are missing (characterBrief drives the character agent in turns 2-4;
// characterName is the chat bubble label; skillsTested powers debrief tie-back).
// Haiku occasionally drops these — validate + retry-with-reinforcement (same
// pattern as coach-tells regen in /api/threaded/follow-up).
const REQUIRED_Q_FIELDS = ['question', 'characterBrief', 'skillsTested', 'characterName'];

function questionMissingFields(result) {
  if (!result || typeof result !== 'object') return REQUIRED_Q_FIELDS.slice();
  return REQUIRED_Q_FIELDS.filter(f => {
    const v = result[f];
    if (f === 'skillsTested') return !Array.isArray(v) || v.length === 0;
    return !v || (typeof v === 'string' && v.trim().length === 0);
  });
}

app.post('/api/question/generate', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body is required' });
    }

    // For industry questions, run agentic news research
    if (req.body.forceFormat === 'industry') {
      const research = await agentResearchNews(req.body);
      if (research.length > 0) {
        req.body.realNewsHeadlines = research.map(r => `${r.title}${r.source ? ` — ${r.source}` : ''}`);
        req.body.realNewsArticles = research.map(r => ({ title: r.title, url: r.url, source: r.source, date: r.date }));
        req.body.searchAngles = [...new Set(research.map(r => r.searchAngle))];
      }
    }

    const prompt = prompts.questionEnginePrompt(req.body);
    const isIndustry = req.body.forceFormat === 'industry';
    const tokens = isIndustry ? 1500 : 1200;
    // Industry path needs more headroom — news research already ate 5-10s.
    const timeoutMs = isIndustry ? 45000 : 30000;
    // Haiku: question generation is formulaic and high-volume. Per-call
    // savings ~12×; quality drop negligible per the audit.
    let result = await callClaude(prompt, tokens, { model: MODELS.HAIKU, timeoutMs });
    let missing = questionMissingFields(result);
    if (missing.length > 0) {
      logError(`Question response missing fields: ${missing.join(', ')} — retrying with reinforcement`);
      const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response was missing required fields: ${missing.join(', ')}. Return ONLY valid JSON with ALL required fields populated. Re-read the ALWAYS INCLUDE section.`;
      result = await callClaude(retryPrompt, tokens, { model: MODELS.HAIKU, timeoutMs });
      missing = questionMissingFields(result);
    }
    if (missing.length > 0) {
      logError(`Question still missing fields after retry: ${missing.join(', ')}`);
      return res.status(502).json({ error: 'Question generation failed validation. Please try again.', missing });
    }
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Question generation');
  }
});

// ===== Scoring =====

app.post('/api/score', async (req, res) => {
  try {
    if (!req.body?.transcript || typeof req.body.transcript !== 'string') {
      return res.status(400).json({ error: 'transcript is required' });
    }
    if (!req.body?.question || typeof req.body.question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }
    if (req.body.transcript.length > MAX_TRANSCRIPT) {
      return res.status(400).json({ error: 'Transcript too long' });
    }
    req.body.transcript = sanitizeString(req.body.transcript, MAX_TRANSCRIPT);
    req.body.question = sanitizeString(req.body.question, MAX_QUESTION);
    // Onboarding still uses the standalone prompt. For normal scoring, send
    // the static ~4000-token system instructions as a cached system block —
    // ~90% input cost reduction across all scoring calls.
    let prompt, opts = {};
    if (req.body.isOnboarding) {
      prompt = prompts.onboardingScoringPrompt(req.body);
    } else {
      prompt = prompts.scoringPrompt(req.body);
      opts = { cacheSystem: prompts.scoringSystemPrompt };
    }

    // Score the answer
    const result = await callClaude(prompt, 2000, opts);

    // Return immediately — quality gate runs in background for future improvement
    res.json(result);

    // Background: quality gate evaluation (non-blocking, logs only)
    // This data will feed the coaching memory system in a future update
    try {
      const evalPrompt = prompts.scoreEvaluationPrompt({
        question: req.body.question,
        transcript: req.body.transcript,
        scoringResult: result,
      });
      // Haiku: the quality gate is a critic prompt — evaluating, not creating.
      const evaluation = await callClaude(evalPrompt, 400, { model: MODELS.HAIKU });
      const quality = evaluation?.qualityScore || 10;
      if (quality < 7) {
        log(`[Quality Gate] Score ${quality}/10 for question: "${req.body.question.slice(0, 50)}..." — Fixes: ${evaluation.fixes?.slice(0, 100)}`);
      }
    } catch {
      // Non-blocking — silently ignore
    }
  } catch (error) {
    sendError(res, 500, error, 'Scoring');
  }
});

// ===== Threaded Challenge: Follow-up =====
// The character agent. Stays in character for turns 2-4 of a thread.
// Sandboxed — does not see raw user context (CV, notes, role). Reads only
// the original scene + conversation history + a translated characterBrief.

// Coach-tells detector: regex pass over generated character line catches
// the most common drift markers (coach voice, scene self-awareness, AI
// assistant phrasings). Triggers a single regen on detection — no second
// LLM call, zero added cost on the happy path.
const COACH_TELLS = [
  // Coach-voice patterns
  /\bgreat question\b/i,
  /\bgood (point|question)\b/i,
  /\bnotice how\b/i,
  /\byou're doing well\b/i,
  /\bI can see (that |you |how )/i,
  /\bthat('?s| is) (so |really |very )?(understandable|brave|powerful)/i,
  /\bwell done\b/i,
  /\bI'm holding space\b/i,
  /\bthat sounds (so |really |very )?(hard|tough|difficult)\b/i,
  // Scene-bible leakage (character becoming self-aware about the brief)
  /\bI'm here to test\b/i,
  /\b(your|the) (goal|practice|exercise) is\b/i,
  /\bwhat (you're|you are) (practising|practicing|trying to)/i,
  /\bskill (you're|you are) (working|practising|practicing)/i,
  /\bthis (scene|scenario|exercise|simulation)\b/i,
  /\bI'm (just|only) a (character|simulation|role-?play)\b/i,
  // Generic AI-assistant phrasings
  /\bas an AI\b/i,
  /\bI'd be happy to\b/i,
  // Meta / analytic drift (most common failure mode — model commenting on
  // the conversation instead of being inside it)
  /\bI (don't|do not) have (their|the user's|enough)\b/i,
  /\bI notice (you|that you)\b/i,
  /\bI need (to see|to know|more)\b/i,
  /\b(could|can) you (share|tell me|provide|let me know)\b/i,
  /\brecord(ed)? in the conversation\b/i,
  /\bbuild a (genuine|real|proper|good) (follow-?up|response|answer)\b/i,
  /\bthe (user's|user has|user is|user said)\b/i,
  /\bin the (conversation thread|thread)\b/i,
];

function looksLikeCoach(text) {
  if (!text) return false;
  return COACH_TELLS.some(re => re.test(text));
}

app.post('/api/threaded/follow-up', async (req, res) => {
  try {
    if (!req.body?.question || !req.body?.transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }
    req.body.transcript = sanitizeString(req.body.transcript, MAX_TRANSCRIPT);
    req.body.question = sanitizeString(req.body.question, MAX_QUESTION);
    const prompt = prompts.followUpPrompt(req.body);
    // Haiku for cost/latency — character agent prompt is structured enough
    // that Haiku stays in voice on the happy path; the regex catches the
    // rare drift and re-rolls once. 45s timeout covers the worst case where
    // both the initial call AND the regen call need to fire.
    let result = await callClaude(prompt, 400, { model: MODELS.HAIKU, timeoutMs: 45000 });
    let regenFired = false;
    if (looksLikeCoach(result?.followUp) || looksLikeCoach(result?.reaction)) {
      regenFired = true;
      const retryPrompt = prompt + '\n\nIMPORTANT: Your previous response broke character with coach-like or meta language. Try again, speaking ONLY as the person in the scene, never as an AI, coach, or narrator. No "great question", no references to "the exercise" or "the scene", no thanking the user. Stay in voice.';
      result = await callClaude(retryPrompt, 400, { model: MODELS.HAIKU, timeoutMs: 45000 });
    }
    // Phase 6: observability. Fire-and-forget so failures don't gate the response.
    try {
      agentTraces.captureEvent(req.body?.userId || 'anonymous', 'threaded_follow_up', {
        turn_number: req.body?.turnNumber,
        pressure_level: result?.pressureLevel,
        coach_regen: regenFired,
        has_brief: !!req.body?.characterBrief,
        // Reaction system telemetry — lets us watch escalation patterns,
        // surface-acceptance rate (= lost-user-mid-scene), and which signal
        // reads correlate with which reactions.
        reaction_type: result?.reactionType || null,
        signal_read: result?.signalRead || null,
        prior_reactions: Array.isArray(req.body?.reactionHistory) ? req.body.reactionHistory.length : 0,
      });
    } catch (_) {}
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Follow-up generation');
  }
});

// ===== Threaded Challenge: Follow-up (Agentic v2) =====
// Same input/output shape as v1 + optional userId/sessionId.
// Falls back to v1 behaviour automatically on agent failure.

app.post('/api/v2/threaded/follow-up', async (req, res) => {
  try {
    if (!req.body?.question || !req.body?.transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }
    req.body.transcript = sanitizeString(req.body.transcript, MAX_TRANSCRIPT);
    req.body.question = sanitizeString(req.body.question, MAX_QUESTION);

    // SECURITY: only trust req.userId from the verifyUser middleware.
    // Ignore any req.body.userId — clients cannot self-attest identity.
    const userId = req.userId || null;
    const sessionId = typeof req.body.sessionId === 'string' && req.body.sessionId.length > 0 ? req.body.sessionId : null;
    // If userId is unverified, fall through to v1 immediately — no agent retrieval.
    if (!userId) {
      const prompt = prompts.followUpPrompt(req.body);
      const result = await callClaude(prompt, 400, { model: MODELS.HAIKU, timeoutMs: 45000 });
      return res.json(result);
    }

    apiUsage.anthropic.calls++; // approximate; runner increments token counts internally
    try {
      const result = await generateThreadedFollowUp({
        anthropic, supabase, userId, sessionId, payload: req.body,
      });
      const { requestId, ...clientShape } = result; // strip requestId unless ?debug=1
      if (req.query.debug === '1') return res.json({ ...clientShape, requestId });
      return res.json(clientShape);
    } catch (agentError) {
      // Agent failure -> fall back to v1 deterministic prompt so the user
      // never sees a broken thread mid-session. Logged for investigation.
      logError('Agentic follow-up failed, falling back to v1:', agentError);
      const prompt = prompts.followUpPrompt(req.body);
      const result = await callClaude(prompt, 400, { model: MODELS.HAIKU, timeoutMs: 45000 });
      res.json(result);
    }
  } catch (error) {
    sendError(res, 500, error, 'Follow-up generation (v2)');
  }
});

// ===== Threaded Challenge: Debrief =====

app.post('/api/threaded/debrief', async (req, res) => {
  try {
    const turns = req.body?.turns;
    if (!Array.isArray(turns) || turns.length === 0) {
      return res.status(400).json({ error: 'turns array is required and non-empty' });
    }
    // Structural validation — return a clean 400 with a specific message
    // rather than crashing inside the prompt builder.
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (!t || typeof t !== 'object' || typeof t.question !== 'string' || typeof t.transcript !== 'string' || !t.question.trim() || !t.transcript.trim()) {
        return res.status(400).json({ error: `Turn ${i + 1} is missing question or transcript` });
      }
    }
    const prompt = prompts.debriefPrompt(req.body);
    // Sonnet at 2000 tokens — 35s gives a small margin over typical ~20s.
    const result = await callClaude(prompt, 2000, { timeoutMs: 35000 });
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Debrief');
  }
});

// ===== Progress Summary =====

app.post('/api/progress/summary', async (req, res) => {
  try {
    const { progressData, roleText, currentCompany } = req.body;
    const safeRole = sanitizeString(roleText, 200);
    const safeCompany = sanitizeString(currentCompany, 200);
    const prompt = `You are Sharp, a communication coach. Generate a 30-second spoken progress summary for your student.

THEIR DATA:
- Total sessions: ${Number(progressData?.totalSessions) || 0}
- Sessions this week: ${Number(progressData?.sessionsThisWeek) || 0} (last week: ${Number(progressData?.sessionsLastWeek) || 0})
- Current streak: ${Number(progressData?.currentStreak) || 0} days (best ever: ${Number(progressData?.longestStreak) || 0})
- Role: ${safeRole || 'Not set'}
- Company: ${safeCompany || 'Not set'}

SCORE TRENDS (recent sessions):
${JSON.stringify(progressData.overallTrend?.slice(-10) || [])}

DIMENSION AVERAGES:
${JSON.stringify(progressData.dimensionAverages)}

DIMENSION CHANGES (first 5 sessions → last 5):
${JSON.stringify(progressData.dimensionTrends)}

FILLER WORDS: Early average score ${progressData.fillerTrend?.early}, Recent: ${progressData.fillerTrend?.recent} (higher = fewer fillers)

BEST SESSION: ${progressData.bestSession ? `${progressData.bestSession.score} on ${progressData.bestSession.date}` : 'None yet'}

BIGGEST IMPROVEMENT DIMENSION: ${progressData.worstToFirst}

RECENT COACHING INSIGHTS:
${(progressData.recentInsights || []).map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

GENERATE A NATURAL, SPOKEN 30-SECOND SUMMARY. Rules:
- Sound like a coach talking to their student face-to-face over coffee
- Lead with the most impressive stat or improvement
- Reference specific numbers ("your structure went from 4.2 to 6.8")
- If they're improving, celebrate it ("you're genuinely getting sharper")
- If they're plateauing, reframe it constructively ("you've built a solid base, now let's push for the next level")
- If they're new (< 3 sessions), welcome them and set expectations
- End with ONE specific thing to focus on next
- Keep it under 100 words — it needs to be speakable in 30 seconds
- DO NOT use bullet points or formatting — this is pure spoken text

Return ONLY valid JSON (no markdown):
{
  "spokenSummary": "<the 30-second spoken summary — conversational, warm, data-driven>",
  "highlights": ["<3-4 short highlight bullets for the UI, e.g. 'Structure up 1.5 points', 'Best score: 7.8'>"],
  "focusArea": "<the ONE dimension or skill they should focus on next, with a reason>",
  "encouragement": "<a short motivational line specific to their progress>"
}`;

    // Haiku: progress summary is short + formulaic.
    const result = await callClaude(prompt, 600, { model: MODELS.HAIKU });
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Progress summary');
  }
});

// ===== Cross-Session Pattern Extraction =====
// Surfaces 2-3 behavioural patterns that repeat across the user's recent
// sessions. Run on-demand from the analytics screen; client caches 7 days +
// invalidates after +5 new sessions. Sonnet for quality (catches subtle
// repetition that Haiku would miss). Coach-tells regex sanity-checks the
// output to keep generic praise out.

const PATTERN_FORBIDDEN = [
  /\bgreat (job|work|progress|question)\b/i,
  /\byou'?re (improving|doing (well|great)|getting better)\b/i,
  /\bI (notice|see|hold space|observe)\b/i,
  /\bnotice how\b/i,
  /\bkeep (it )?up\b/i,
  /\bbe more (concise|specific|clear)\b/i,
  /\bwork on (your )?(structure|concision|substance|clarity)\b/i,
  /\btry to be (more )?(concise|specific|clear)\b/i,
];

function looksLikeGenericCoachOutput(text) {
  if (!text || typeof text !== 'string') return false;
  return PATTERN_FORBIDDEN.some(re => re.test(text));
}

app.post('/api/analytics/patterns', async (req, res) => {
  try {
    const { sessions, roleText, currentCompany, situationText, dreamRoleAndCompany, notes } = req.body || {};
    const safeSessions = Array.isArray(sessions) ? sessions.slice(0, 20) : [];
    if (safeSessions.length < 5) {
      // Not enough data — return empty patterns. Client renders an empty state.
      return res.json({ patterns: [], sessionsAnalysed: safeSessions.length, reason: 'not_enough_data' });
    }

    const prompt = prompts.patternExtractionPrompt({
      sessionCount: safeSessions.length,
      sessions: safeSessions,
      roleText: sanitizeString(roleText, 200),
      currentCompany: sanitizeString(currentCompany, 200),
      situationText: sanitizeString(situationText, 2000),
      dreamRoleAndCompany: sanitizeString(dreamRoleAndCompany, 200),
      notes: sanitizeString(notes, 3000),
    });

    const result = await callClaude(prompt, 1200, { model: MODELS.SONNET });

    // Sanity check: filter out patterns whose pattern/oneThing reads like
    // generic coach output. Keeps the surface area opinionated rather than
    // sliding back into "you should be more concise" mush.
    const patterns = Array.isArray(result.patterns) ? result.patterns : [];
    const filtered = patterns.filter(p =>
      p &&
      typeof p.pattern === 'string' &&
      Array.isArray(p.evidence) &&
      p.evidence.length >= 2 &&
      !looksLikeGenericCoachOutput(p.pattern) &&
      !looksLikeGenericCoachOutput(p.oneThing)
    );

    res.json({ patterns: filtered, sessionsAnalysed: safeSessions.length });
  } catch (error) {
    sendError(res, 500, error, 'Pattern extraction');
  }
});

// ===== Transcription (Groq/Whisper) =====

const { execFileSync } = require('child_process');

app.post('/api/transcribe', async (req, res) => {
  const files = [];
  try {
    const { audio, filename } = req.body;
    log('Transcribe request received. Has audio:', !!audio, 'Body keys:', Object.keys(req.body));
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'No audio data. Send { audio: base64, filename: "recording.m4a" }' });
    }

    const buffer = Buffer.from(audio, 'base64');
    if (buffer.length > MAX_AUDIO_BYTES) {
      return res.status(400).json({ error: 'Audio file too large (max 15MB)' });
    }
    log('Decoded buffer size:', buffer.length, 'bytes');
    const ts = Date.now();
    const rawPath = path.join(__dirname, 'uploads', `rec_${ts}_raw.m4a`);
    const mp3Path = path.join(__dirname, 'uploads', `rec_${ts}.mp3`);
    files.push(rawPath, mp3Path);

    fs.writeFileSync(rawPath, buffer);

    // Audio conversion pipeline — works on macOS AND Linux
    // Strategy: try multiple approaches, use first that succeeds
    const wavPath = rawPath.replace('_raw.m4a', '.wav');
    files.push(wavPath);
    let convertedPath = null;

    // Approach 1: afconvert → ffmpeg (macOS only, handles chnl box)
    try {
      execFileSync('afconvert', [rawPath, wavPath, '-d', 'LEI16', '-f', 'WAVE'], { timeout: 15000, stdio: 'ignore' });
      execFileSync('ffmpeg', ['-i', wavPath, '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k', mp3Path, '-y'], { timeout: 15000, stdio: 'ignore' });
      convertedPath = mp3Path;
      log('afconvert+ffmpeg success:', fs.statSync(rawPath).size, '→', fs.statSync(mp3Path).size);
    } catch (_) {
      // Approach 2: ffmpeg directly with -err_detect ignore_err (Linux, newer ffmpeg)
      try {
        execFileSync('ffmpeg', ['-err_detect', 'ignore_err', '-i', rawPath, '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k', mp3Path, '-y'], { timeout: 15000, stdio: 'ignore' });
        if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 1000) {
          convertedPath = mp3Path;
          log('ffmpeg direct success:', fs.statSync(mp3Path).size);
        }
      } catch (__) {}

      // Approach 3: send raw M4A to Groq (some versions accept it)
      if (!convertedPath) {
        convertedPath = rawPath;
        log('Using raw M4A as fallback');
      }
    }

    resetUsageIfNewDay();
    apiUsage.groq.calls++;
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(convertedPath),
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'verbose_json',
      });

      res.json({
        transcript: transcription.text,
        duration: transcription.duration || 0,
      });
    } finally {
      // Always clean up temp files
      files.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  } catch (error) {
    apiUsage.groq.errors++;
    files.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    sendError(res, 500, error, 'Transcription');
  }
});

// ===== Document Text Extraction =====

app.post('/api/document/extract-text', async (req, res) => {
  try {
    const { fileBase64, filename } = req.body;
    if (!fileBase64 || !filename) {
      return res.status(400).json({ error: 'fileBase64 and filename are required' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 10MB)' });
    }

    const ext = filename.toLowerCase().split('.').pop();
    let rawText = '';

    if (ext === 'pdf') {
      const parser = new PDFParse({ data: buffer, verbosity: 0 });
      await parser.load();
      const result = await parser.getText();
      rawText = result.text;
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      rawText = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: `Unsupported file type: .${ext}. Use PDF, DOCX, TXT, or MD.` });
    }

    rawText = rawText.trim();
    if (!rawText || rawText.length < 20) {
      return res.status(400).json({ error: 'Could not extract meaningful text from this file. It may be scanned or image-based.' });
    }

    res.json({ rawText });
  } catch (error) {
    sendError(res, 500, error, 'Document text extraction');
  }
});

// ===== Document Parsing =====

app.post('/api/document/parse', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) {
      return res.status(400).json({ error: 'No document text provided' });
    }

    // Trim to ~4000 chars to manage token costs
    const trimmed = rawText.substring(0, 4000);
    const prompt = prompts.documentParsingPrompt(trimmed);
    const result = await callClaude(prompt, 1000);
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Document parsing');
  }
});

// ===== Waitlist =====

const WAITLIST_FILE = path.join(__dirname, 'waitlist.json');

app.post('/api/waitlist', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const sanitized = email.trim().toLowerCase().slice(0, 200);
    let list = [];
    try { list = JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8')); } catch {}
    if (list.some(e => e.email === sanitized)) {
      return res.json({ status: 'already_joined' });
    }
    list.push({ email: sanitized, joinedAt: new Date().toISOString() });
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
    log('Waitlist signup:', sanitized, '— total:', list.length);
    res.json({ status: 'joined', count: list.length });
  } catch (error) {
    sendError(res, 500, error, 'Waitlist');
  }
});

app.get('/api/waitlist/count', (req, res) => {
  try {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8')); } catch {}
    res.json({ count: list.length });
  } catch (error) {
    sendError(res, 500, error, 'Waitlist count');
  }
});

// ===== Feature Requests (in-app feedback) =====

const FEATURE_REQUESTS_FILE = path.join(__dirname, 'feature-requests.json');

app.post('/api/feature-request', (req, res) => {
  try {
    const { request, userId, timestamp } = req.body;
    if (!request || typeof request !== 'string') {
      return res.status(400).json({ error: 'Request text required' });
    }
    let list = [];
    try { list = JSON.parse(fs.readFileSync(FEATURE_REQUESTS_FILE, 'utf8')); } catch {}
    list.push({ request: request.trim().slice(0, 500), userId: userId || 'anonymous', timestamp: timestamp || new Date().toISOString() });
    fs.writeFileSync(FEATURE_REQUESTS_FILE, JSON.stringify(list, null, 2));
    log('Feature request:', request.trim().slice(0, 100), '— total:', list.length);
    res.json({ status: 'received', count: list.length });
  } catch (error) {
    sendError(res, 500, error, 'Feature request');
  }
});

app.get('/api/feature-requests', (req, res) => {
  try {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(FEATURE_REQUESTS_FILE, 'utf8')); } catch {}
    res.json({ requests: list, count: list.length });
  } catch (error) {
    sendError(res, 500, error, 'Feature requests list');
  }
});

// ===== RevenueCat Webhook =====

// Constant-time string comparison to defend against timing attacks on the
// webhook bearer token.
function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const crypto = require('crypto');
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  try { return crypto.timingSafeEqual(bufA, bufB); } catch { return false; }
}

const RC_ACTIVATE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE']);
const RC_DEACTIVATE_EVENTS = new Set(['EXPIRATION', 'BILLING_ISSUE', 'CANCELLATION']);
const RC_KNOWN_EVENTS = new Set([
  ...RC_ACTIVATE_EVENTS,
  ...RC_DEACTIVATE_EVENTS,
  'TRANSFER', 'SUBSCRIPTION_PAUSED', 'TEST', 'INVOICE_ISSUANCE',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post('/api/webhooks/revenuecat', async (req, res) => {
  try {
    // 1. Require the shared secret to be configured. Without this, ANY
    //    request would be accepted — that's not OK in production.
    const expectedToken = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expectedToken) {
      logError('RevenueCat webhook: REVENUECAT_WEBHOOK_SECRET not configured — rejecting');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    // 2. Validate Bearer token with constant-time compare.
    const authHeader = String(req.headers['authorization'] || '');
    const prefix = 'Bearer ';
    if (!authHeader.startsWith(prefix) || !timingSafeEqualStrings(authHeader.slice(prefix.length), expectedToken)) {
      logError(`RevenueCat webhook: unauthorized attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 3. Validate body shape.
    const event = req.body?.event;
    if (!event || typeof event !== 'object') {
      return res.status(400).json({ error: 'No event' });
    }
    const appUserId = event.app_user_id;
    const eventType = event.type;

    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({ error: 'Missing event type' });
    }
    if (!RC_KNOWN_EVENTS.has(eventType)) {
      log(`RevenueCat webhook: ignoring unknown event type ${eventType}`);
      return res.json({ ok: true, skipped: 'unknown event type' });
    }
    if (appUserId && !UUID_RE.test(String(appUserId))) {
      log(`RevenueCat webhook: skipping non-UUID app_user_id "${appUserId}"`);
      return res.json({ ok: true, skipped: 'non-uuid app_user_id' });
    }

    log(`RevenueCat webhook: ${eventType} for user ${appUserId || 'unknown'}`);

    if (!supabase) {
      log('RevenueCat webhook: Supabase not configured, skipping DB update');
      return res.json({ ok: true });
    }

    if (RC_ACTIVATE_EVENTS.has(eventType) && appUserId) {
      await supabase.from('profiles').update({
        is_premium: true,
        updated_at: new Date().toISOString(),
      }).eq('id', appUserId);
    } else if (RC_DEACTIVATE_EVENTS.has(eventType) && appUserId) {
      await supabase.from('profiles').update({
        is_premium: false,
        updated_at: new Date().toISOString(),
      }).eq('id', appUserId);
    }

    res.json({ ok: true });
  } catch (error) {
    sendError(res, 500, error, 'RevenueCat webhook');
  }
});

// ===== Conversation Practice: Setup =====

app.post('/api/conversation/setup', async (req, res) => {
  try {
    if (!req.body?.scenario) {
      return res.status(400).json({ error: 'scenario is required' });
    }
    const prompt = prompts.conversationSetupPrompt(req.body);
    // Haiku: persona builder for a hidden feature; speed > depth here.
    const result = await callClaude(prompt, 500, { model: MODELS.HAIKU });
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Conversation setup');
  }
});

// ===== Conversation Practice: Signed URL for ElevenLabs Conversational AI =====

app.post('/api/conversation/signed-url', async (req, res) => {
  try {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!agentId || !process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: 'Conversational AI not configured. Set ELEVENLABS_AGENT_ID and ELEVENLABS_API_KEY.' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logError('ElevenLabs signed URL error:', errorText);
      throw new Error('Failed to connect to conversational AI service');
    }

    const data = await response.json();
    res.json({ signedUrl: data.signed_url });
  } catch (error) {
    sendError(res, 500, error, 'Conversation signed URL');
  }
});

// ===== Conversation Practice: Fetch Transcript from ElevenLabs =====

app.get('/api/conversation/transcript/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: 'ElevenLabs not configured' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logError('ElevenLabs transcript error:', errorText);
      throw new Error('Failed to fetch conversation transcript');
    }

    const data = await response.json();

    // Transform ElevenLabs transcript into Sharp's turn format
    const transcript = data.transcript || [];
    const turns = [];
    let currentAgent = '';
    let currentUser = '';
    let turnNum = 0;

    for (const entry of transcript) {
      if (entry.role === 'agent') {
        if (currentAgent && currentUser) {
          turns.push({
            turnNumber: turnNum,
            agentMessage: currentAgent,
            userTranscript: currentUser,
            timestamp: new Date().toISOString(),
          });
          turnNum++;
          currentAgent = '';
          currentUser = '';
        }
        currentAgent += (currentAgent ? ' ' : '') + (entry.message || '');
      } else if (entry.role === 'user') {
        currentUser += (currentUser ? ' ' : '') + (entry.message || '');
      }
    }

    // Push final turn
    if (currentAgent || currentUser) {
      turns.push({
        turnNumber: turnNum,
        agentMessage: currentAgent,
        userTranscript: currentUser,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      conversationId: data.conversation_id,
      status: data.status,
      turns,
      analysis: data.analysis || null,
      metadata: {
        duration: data.metadata?.call_duration_secs,
        startTime: data.metadata?.start_time_unix_secs,
      },
    });
  } catch (error) {
    sendError(res, 500, error, 'Conversation transcript');
  }
});

// ===== Conversation Practice: Respond (low latency) =====

app.post('/api/conversation/respond', async (req, res) => {
  try {
    if (!req.body?.latestTranscript) {
      return res.status(400).json({ error: 'latestTranscript is required' });
    }
    if (!req.body?.agentPersona || !req.body?.turns) {
      return res.status(400).json({ error: 'agentPersona and turns are required' });
    }
    req.body.latestTranscript = sanitizeString(req.body.latestTranscript, MAX_TRANSCRIPT);
    const prompt = prompts.conversationRespondPrompt(req.body);
    // Haiku: live-voice latency-critical. Fast > deep here.
    const result = await callClaude(prompt, 300, { model: MODELS.HAIKU });
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Conversation respond');
  }
});

// ===== Conversation Practice: Debrief =====

app.post('/api/conversation/debrief', async (req, res) => {
  try {
    if (!req.body?.turns || !Array.isArray(req.body.turns)) {
      return res.status(400).json({ error: 'turns array is required' });
    }
    const prompt = prompts.conversationDebriefPrompt(req.body);
    const result = await callClaude(prompt, 2000);
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Conversation debrief');
  }
});

// ===== Text-to-Speech =====
// Provider switch via TTS_PROVIDER env. Default = Kokoro (cheap, via Together AI).
// Set TTS_PROVIDER=elevenlabs to fall back to the previous provider instantly.

const useKokoro = process.env.TTS_PROVIDER !== 'elevenlabs';

// In-memory server-side cache. Same text+mode combo hits the TTS provider
// once. Shared content (e.g. the daily question) is generated for one user
// and served from RAM for everyone else. ~99% provider-call reduction on
// the hottest paths.
const ttsCache = new Map();
const TTS_CACHE_MAX = 200;
const TTS_CACHE_TTL = 3600_000; // 1h

// Singleflight — pending TTS generation per cache key. Concurrent requests
// for the same text+mode wait on the same promise instead of all hitting
// the upstream provider.
const ttsPending = new Map(); // key -> Promise<Buffer>

// Cache key includes the resolved voice + provider so a voice change
// (e.g. am_michael -> am_adam) invalidates old cached audio rather than
// silently serving the previous voice on cache hits.
function getTtsCacheKey(text, mode) {
  const crypto = require('crypto');
  const voice = (useKokoro
    ? (KOKORO_VOICE_MODES[mode] || KOKORO_VOICE_MODES.question).voice
    : 'eleven-default');
  const provider = useKokoro ? 'kokoro' : 'elevenlabs';
  return crypto.createHash('md5').update(`${provider}:${voice}:${mode}:${text}`).digest('hex');
}

// Size-bounded LRU-style eviction. Called on insert.
function cleanTtsCache() {
  if (ttsCache.size <= TTS_CACHE_MAX) return;
  const oldest = [...ttsCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < oldest.length - TTS_CACHE_MAX; i++) ttsCache.delete(oldest[i][0]);
}

// TTL-based eviction. Runs every 10min regardless of insertion activity, so
// expired entries don't linger forever in low-traffic periods.
setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of ttsCache) {
    if (now - entry.ts > TTS_CACHE_TTL) { ttsCache.delete(key); evicted++; }
  }
  if (evicted) log(`[tts cache] evicted ${evicted} expired entries (${ttsCache.size} remain)`);
}, 600_000).unref();

// Kokoro voice mappings.
// Single coherent identity (American male, clear/articulate) with subtle
// speed variation per mode. Other voices we've considered:
//   am_michael — neutral, clear, mid-range (← chosen default)
//   am_adam    — deeper, more authoritative
//   am_eric    — articulate, slightly older
//   am_onyx    — warmer, fuller
// Swap the `voice` field below to change.
const KOKORO_VOICE_MODES = {
  question:  { voice: 'am_michael', speed: 1.0  },  // baseline
  coaching:  { voice: 'am_michael', speed: 0.92 }, // slightly slower — warmer for feedback
  model:     { voice: 'am_michael', speed: 1.05 }, // crisper for "this is how to say it"
  followup:  { voice: 'am_michael', speed: 1.02 }, // mildly assertive for pressure
  briefing:  { voice: 'am_michael', speed: 0.96 }, // measured for longer setup
};

// ElevenLabs voice modes — kept for fallback when TTS_PROVIDER=elevenlabs
const ELEVENLABS_VOICE_MODES = {
  question:  { stability: 0.6,  similarity_boost: 0.75, style: 0.2,  use_speaker_boost: true },
  coaching:  { stability: 0.75, similarity_boost: 0.8,  style: 0.1,  use_speaker_boost: true },
  model:     { stability: 0.7,  similarity_boost: 0.85, style: 0.3,  use_speaker_boost: true },
  followup:  { stability: 0.55, similarity_boost: 0.7,  style: 0.35, use_speaker_boost: true },
  briefing:  { stability: 0.8,  similarity_boost: 0.8,  style: 0.15, use_speaker_boost: true },
};

// Sends a fully-realized buffer to the client. Used for cache hits and for
// singleflight waiters (who arrive after the originator has already finished
// fetching, so the buffer is the only thing available to them).
function sendAudioBuffer(res, buffer, headers) {
  res.set({ ...headers, 'Content-Length': buffer.length });
  res.send(buffer);
}

// Originator path: opens the upstream connection, streams chunks to the
// client AS they arrive (so TTFA stays ~400-700ms), AND accumulates a copy
// for the cache. If the client disconnects mid-stream we keep draining
// upstream so the cache still fills — same text will arrive instantly next
// time. The only hard stop is the 30s abort timeout on upstream itself.
async function streamUpstreamAndCacheBuffer(providerResponse, res, headers) {
  res.set(headers);
  res.flushHeaders();

  const reader = providerResponse.body.getReader();
  const chunks = [];
  let clientClosed = false;
  // Watch for client disconnect — but DON'T abort upstream on it. The
  // upstream is cheap to drain and the cache benefit is worth it.
  const onClose = () => { clientClosed = true; };
  res.on('close', onClose);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      // Always collect chunks for the cache, even if the client is gone.
      chunks.push(Buffer.from(value));
      // Only write to the client if it's still connected.
      if (!clientClosed && !res.writableEnded) {
        try {
          res.write(value);
          if (typeof res.flush === 'function') res.flush();
        } catch {
          // write() can throw if the underlying socket is gone — treat as
          // client closed and keep draining for the cache.
          clientClosed = true;
        }
      }
    }
  } finally {
    res.off('close', onClose);
    try { reader.releaseLock(); } catch {}
    if (!res.writableEnded) {
      try { res.end(); } catch {}
    }
  }
  return Buffer.concat(chunks);
}

// Opens the upstream TTS connection and returns the Response object.
// Caller is responsible for draining the body.
async function fetchTtsResponse(text, mode, abortSignal) {
  apiUsage.elevenlabs.calls++; // legacy field — tracks total TTS calls regardless of provider
  apiUsage.elevenlabs.characters += String(text).length;

  let response;
  if (useKokoro) {
    const voiceConfig = KOKORO_VOICE_MODES[mode] || KOKORO_VOICE_MODES.question;
    const kokoroBaseUrl = process.env.KOKORO_TTS_URL || 'https://api.together.ai';
    // NOTE: stream: false is REQUIRED.
    // With stream: true, Together AI's /v1/audio/speech returns Server-Sent
    // Events containing base64-encoded audio deltas, NOT raw MP3 bytes —
    // AVPlayer / MediaPlayer can't parse that. With stream: false we get
    // a single response body of real MP3 bytes (which our server then
    // streams chunk-by-chunk to the client + caches).
    response = await fetch(`${kokoroBaseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'hexgrad/Kokoro-82M',
        input: String(text),
        voice: voiceConfig.voice,
        speed: voiceConfig.speed,
        response_format: 'mp3',
        stream: false,
      }),
      signal: abortSignal,
    });
  } else {
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const voiceSettings = ELEVENLABS_VOICE_MODES[mode] || ELEVENLABS_VOICE_MODES.question;
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: voiceSettings,
          optimize_streaming_latency: 4,
        }),
        signal: abortSignal,
      }
    );
  }

  if (!response.ok) {
    apiUsage.elevenlabs.errors++;
    const errorText = await response.text();
    logError(`${useKokoro ? 'Kokoro' : 'ElevenLabs'} TTS error:`, errorText);
    throw new Error('Text-to-speech service unavailable');
  }
  return response;
}

// Support both GET (short text via query) and POST (long text via body)
app.all('/api/tts', async (req, res) => {
  try {
    const text = req.body?.text || req.query.text;
    const mode = req.body?.mode || req.query.mode || 'question';
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }
    if (String(text).length > MAX_TTS_TEXT) {
      return res.status(400).json({ error: 'Text too long' });
    }
    if (useKokoro && !process.env.TOGETHER_API_KEY) {
      return res.status(503).json({ error: 'TTS not configured — TOGETHER_API_KEY missing' });
    }
    if (!useKokoro && (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID)) {
      return res.status(503).json({ error: 'TTS not configured — ElevenLabs keys missing' });
    }

    resetUsageIfNewDay();
    const provider = useKokoro ? 'kokoro' : 'elevenlabs';
    const cacheKey = getTtsCacheKey(String(text), mode);

    // 1. Cache hit — instant, no provider call.
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      cached.ts = Date.now();
      sendAudioBuffer(res, cached.data, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
        'X-TTS-Cache': 'hit',
        'X-TTS-Provider': provider,
      });
      return;
    }

    // 2. Singleflight waiter — another request is already generating this
    //    exact text+mode. Wait for its buffer and serve from it.
    const existingPromise = ttsPending.get(cacheKey);
    if (existingPromise) {
      try {
        const buffer = await existingPromise;
        if (!res.writableEnded) {
          sendAudioBuffer(res, buffer, {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
            'X-TTS-Cache': 'singleflight',
            'X-TTS-Provider': provider,
          });
        }
      } catch (e) {
        if (!res.headersSent) sendError(res, 502, e, 'TTS waiter');
      }
      return;
    }

    // 3. Originator path — stream upstream chunks to this client AS they
    //    arrive (TTFA ~400-700ms) while collecting a copy for the cache
    //    and for any singleflight waiters that race in.
    const upstreamAbort = new AbortController();
    const upstreamTimeout = setTimeout(() => upstreamAbort.abort(), 30_000);

    let resolveBuffer, rejectBuffer;
    const bufferPromise = new Promise((resolve, reject) => {
      resolveBuffer = resolve; rejectBuffer = reject;
    });
    ttsPending.set(cacheKey, bufferPromise);

    try {
      const providerResponse = await fetchTtsResponse(String(text), mode, upstreamAbort.signal);
      // Stream to client + collect for cache. If the client disconnects
      // mid-stream we still drain upstream so the buffer (and cache) fill.
      const buffer = await streamUpstreamAndCacheBuffer(providerResponse, res, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-TTS-Cache': 'miss',
        'X-TTS-Provider': provider,
      });

      if (buffer.length) {
        cleanTtsCache();
        ttsCache.set(cacheKey, { data: buffer, ts: Date.now() });
      }
      resolveBuffer(buffer);
    } catch (e) {
      rejectBuffer(e);
      throw e;
    } finally {
      clearTimeout(upstreamTimeout);
      ttsPending.delete(cacheKey);
    }

  } catch (error) {
    logError('TTS error:', error);
    if (!res.headersSent) {
      sendError(res, 500, error, 'TTS');
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

// ===== Account Deletion =====
// Apple Guideline 5.1.1(v): in-app account deletion. Calls
// supabase.auth.admin.deleteUser; all user_id-keyed rows cascade-delete on
// auth.users. Idempotent — returns 204 on success and on "already deleted"
// so a double-tap from the client never surfaces an error.

app.post('/api/account/delete', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Account service unavailable. Please try again later.' });
    }
    if (!req.userId) {
      // If a Bearer token was presented but didn't resolve to a user,
      // the user is already deleted server-side — return 204 so the
      // client runs local cleanup. Without any token at all, reject.
      const hadToken = (req.headers.authorization || '').toLowerCase().startsWith('bearer ');
      if (hadToken) {
        agentTraces.captureEvent('anonymous', 'account_delete', { result: 'stale_token_already_deleted' });
        return res.status(204).send();
      }
      return res.status(401).json({ error: 'Authentication required to delete your account.' });
    }

    const userId = req.userId;
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      const msg = (error.message || '').toLowerCase();
      // "User not found" => already deleted, treat as success (idempotent).
      if (msg.includes('not found') || msg.includes('does not exist')) {
        agentTraces.captureEvent(userId, 'account_delete', { result: 'already_deleted' });
        return res.status(204).send();
      }
      logError('Account delete failed:', error);
      agentTraces.captureEvent(userId, 'account_delete', { result: 'error', message: error.message });
      return res.status(500).json({ error: 'Could not delete account. Please try again or contact support.' });
    }

    agentTraces.captureEvent(userId, 'account_delete', { result: 'success' });
    return res.status(204).send();
  } catch (e) {
    logError('Account delete unexpected error:', e);
    return res.status(500).json({ error: 'Could not delete account. Please try again or contact support.' });
  }
});

// ===== Request Timeout =====

app.use((req, res, next) => {
  req.setTimeout(60000); // 60s timeout for all requests
  res.setTimeout(60000);
  next();
});

// ===== Push Notifications =====

// Register a push token
app.post('/api/notifications/register', async (req, res) => {
  try {
    const { token, userId } = req.body;
    if (!token || !userId) return res.status(400).json({ error: 'token and userId required' });
    if (!supabase) return res.json({ ok: true }); // No Supabase = skip silently

    await supabase.from('profiles').update({
      push_token: token,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);

    res.json({ ok: true });
  } catch (error) {
    sendError(res, 500, error, 'Push token registration');
  }
});

// Send a push notification via Expo's push service
async function sendPushNotification(pushToken, title, body, data = {}) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Log push delivery attempts to PostHog (best-effort, never throws).
// Lets us see delivery success rate per kind without per-user log spam.
function captureSendEvent({ userId, kind, success }) {
  try {
    const traces = require('./agent/traces');
    traces.captureEvent(userId || 'anonymous', 'push_send_attempt', { kind, success });
  } catch {}
}

// List users with push tokens — debug endpoint
app.get('/api/notifications/debug', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, push_token')
      .not('push_token', 'is', null);
    res.json({
      usersWithTokens: (profiles || []).length,
      users: (profiles || []).map(p => ({
        id: p.id.slice(0, 8) + '...',
        name: p.display_name,
        tokenPrefix: p.push_token?.slice(0, 25) + '...',
      })),
    });
  } catch (error) {
    sendError(res, 500, error, 'Notification debug');
  }
});

// Test notification — send a test push to a specific user
app.post('/api/notifications/test', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    // Look up push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token, display_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.json({ error: 'User not found', userId, profileError: profileError?.message });
    }

    if (!profile.push_token) {
      return res.json({ error: 'No push token saved for this user', userId, displayName: profile.display_name });
    }

    const sent = await sendPushNotification(
      profile.push_token,
      'Sharp Test',
      `Hey ${profile.display_name || 'there'}, notifications are working!`,
      { type: 'test' }
    );

    res.json({ sent, token: profile.push_token.slice(0, 20) + '...', displayName: profile.display_name });
  } catch (error) {
    sendError(res, 500, error, 'Test notification');
  }
});

// Activation sequence — targeted pushes based on days since signup.
// Batches DB queries by user_id IN (...) so 1000 users = ~3 queries total.
app.post('/api/notifications/activation-check', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, push_token, created_at')
      .not('push_token', 'is', null);

    // Bucket users by their activation day so we only query the data we need.
    const now = Date.now();
    const buckets = { day1: [], day7: [], day14: [], skip: [], day3: [] };
    for (const p of (profiles || [])) {
      if (!p.push_token || !p.created_at) { buckets.skip.push(p); continue; }
      const days = Math.floor((now - new Date(p.created_at).getTime()) / 86400000);
      if (days === 1) buckets.day1.push(p);
      else if (days === 3) buckets.day3.push(p);
      else if (days === 7) buckets.day7.push(p);
      else if (days === 14) buckets.day14.push(p);
      else buckets.skip.push(p);
    }

    const day1Ids = buckets.day1.map(p => p.id);
    const day7Ids = buckets.day7.map(p => p.id);
    const day14Ids = buckets.day14.map(p => p.id);

    // Three parallel batched queries — no per-user round-trips.
    const [day1Turns, day7Turns, day14Streaks] = await Promise.all([
      day1Ids.length
        ? supabase.from('turns').select('user_id, overall').in('user_id', day1Ids).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      day7Ids.length
        ? supabase.from('turns').select('user_id, overall').in('user_id', day7Ids)
        : Promise.resolve({ data: [] }),
      day14Ids.length
        ? supabase.from('streaks').select('user_id, current_streak').in('user_id', day14Ids)
        : Promise.resolve({ data: [] }),
    ]);

    // Group by user_id for O(1) lookups in the per-user loop below.
    const day1FirstScore = new Map();
    for (const t of (day1Turns.data || [])) {
      if (!day1FirstScore.has(t.user_id)) day1FirstScore.set(t.user_id, t.overall);
    }
    const day7TurnsByUser = new Map();
    for (const t of (day7Turns.data || [])) {
      const arr = day7TurnsByUser.get(t.user_id) || [];
      arr.push(t.overall);
      day7TurnsByUser.set(t.user_id, arr);
    }
    const day14StreakByUser = new Map((day14Streaks.data || []).map(s => [s.user_id, s.current_streak || 0]));

    let sent = 0;
    let failed = 0;
    const sendPromises = [];

    function queueSend(profile, title, body) {
      sendPromises.push(
        sendPushNotification(profile.push_token, title, body, { type: 'activation' })
          .then(ok => {
            if (ok) sent++; else failed++;
            captureSendEvent({ userId: profile.id, kind: 'activation', success: !!ok });
          })
      );
    }

    for (const profile of buckets.day1) {
      const name = profile.display_name || 'there';
      const firstScore = day1FirstScore.get(profile.id);
      if (firstScore) {
        queueSend(profile, `You scored ${firstScore.toFixed(1)} on your first try`,
          'Most people start between 5 and 7. Try a One Shot today and see if you can beat it.');
      } else {
        queueSend(profile, 'Your first score is waiting',
          `${name}, try a One Shot today — it only takes 90 seconds to see where you stand.`);
      }
    }
    for (const profile of buckets.day3) {
      const name = profile.display_name || 'there';
      queueSend(profile, 'Ready for pressure?',
        `${name}, try a Threaded Challenge — 4 follow-ups that get harder each turn. It's the closest thing to a real interview.`);
    }
    for (const profile of buckets.day7) {
      const name = profile.display_name || 'there';
      const turns = day7TurnsByUser.get(profile.id) || [];
      if (turns.length >= 3) {
        const avg = (turns.reduce((s, v) => s + (v || 0), 0) / turns.length).toFixed(1);
        queueSend(profile, 'One week of Sharp', `${turns.length} sessions, avg ${avg}. You're building something. Keep going.`);
      } else {
        queueSend(profile, 'One week in', `${name}, you've got the app — now build the habit. One session today, 60 seconds.`);
      }
    }
    for (const profile of buckets.day14) {
      const currentStreak = day14StreakByUser.get(profile.id) || 0;
      if (currentStreak >= 7) {
        queueSend(profile, `${currentStreak}-day streak. You're building a real skill.`,
          "Most people quit by now. You didn't. That matters more than any score.");
      } else {
        queueSend(profile, 'Two weeks in — how sharp are you now?',
          'Do a One Shot today and compare it to your first. The improvement might surprise you.');
      }
    }

    // Send in parallel — Expo push service handles concurrency fine.
    await Promise.all(sendPromises);

    res.json({ sent, failed, checked: profiles?.length || 0 });
  } catch (error) {
    sendError(res, 500, error, 'Activation check');
  }
});

// Engagement check — called by cron or manually to nudge inactive users.
// Batches DB queries by user_id IN (...) so 1000 users = ~3 queries total
// instead of 3000 sequential lookups.
app.post('/api/notifications/engagement-check', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const PAGE_SIZE = 100;
    let offset = 0;
    let totalChecked = 0;
    let nudged = 0;
    let failed = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, push_token')
        .not('push_token', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (!profiles?.length) { hasMore = false; break; }
      if (profiles.length < PAGE_SIZE) hasMore = false;
      offset += PAGE_SIZE;
      totalChecked += profiles.length;

      const profileIds = profiles.map(p => p.id);

      // 3 parallel batched queries instead of 3*N sequential ones
      const [sessionsBatch, streaksBatch, turnsBatch] = await Promise.all([
        supabase.from('sessions').select('user_id, created_at').in('user_id', profileIds).order('created_at', { ascending: false }),
        supabase.from('streaks').select('user_id, current_streak').in('user_id', profileIds),
        supabase.from('turns').select('user_id, overall').in('user_id', profileIds).order('overall', { ascending: false }),
      ]);

      // Group: last session per user, streak per user, best score per user.
      const lastSessionByUser = new Map();
      for (const s of (sessionsBatch.data || [])) {
        if (!lastSessionByUser.has(s.user_id)) lastSessionByUser.set(s.user_id, s.created_at);
      }
      const streakByUser = new Map((streaksBatch.data || []).map(s => [s.user_id, s.current_streak || 0]));
      const bestScoreByUser = new Map();
      for (const t of (turnsBatch.data || [])) {
        if (!bestScoreByUser.has(t.user_id)) bestScoreByUser.set(t.user_id, t.overall || 0);
      }

      // Send loop is mostly compute + HTTP to Expo — push sends are launched
      // in parallel below via Promise.all.
      const sendPromises = [];

      for (const profile of profiles) {
        if (!profile.push_token) continue;

        const lastCreatedAt = lastSessionByUser.get(profile.id);
        const daysSince = lastCreatedAt
          ? Math.floor((Date.now() - new Date(lastCreatedAt).getTime()) / 86400000)
          : 999;
        if (daysSince < 1) continue;

        const streak = streakByUser.get(profile.id) || 0;
        const bestScore = bestScoreByUser.get(profile.id) || 0;

        let title = '';
        let body = '';

        if (streak > 3 && daysSince === 1) {
          title = `Your ${streak}-day streak is at risk`;
          body = 'One quick Daily Challenge keeps it alive. 60 seconds is all it takes.';
        } else if (daysSince >= 3) {
          // Generate with Claude for personalization (TODO: cache or template for cost)
          try {
            const nudgePrompt = `Generate a SHORT, personalized push notification to re-engage a communication training app user.

Their name: ${profile.display_name || 'there'}
Days since last practice: ${daysSince}
Their streak before going quiet: ${streak} days
Their best score ever: ${bestScore.toFixed(1)}/10

Rules:
- Be warm, not guilt-trippy
- Reference a specific stat if impressive (streak, best score)
- Under 100 characters for the body
- Make them want to open the app

Return ONLY JSON: { "title": "...", "body": "..." }`;
            // Haiku: engagement-nudge body is short copy; called per inactive user.
            const nudge = await callClaude(nudgePrompt, 100, { model: MODELS.HAIKU });
            title = nudge?.title || 'Sharp misses you';
            body = nudge?.body || "Your communication skills don't build themselves. One session?";
          } catch {
            title = 'Sharp misses you';
            body = "Your communication skills don't build themselves. One quick session?";
          }
        } else if (daysSince >= 2) {
          title = 'Quick check-in';
          body = streak > 0
            ? `Your ${streak}-day streak is waiting. 60 seconds to keep it going.`
            : 'One Daily Challenge today? It only takes 60 seconds.';
        } else {
          continue;
        }

        sendPromises.push(
          sendPushNotification(profile.push_token, title, body, { type: 'engagement_nudge' })
            .then(ok => {
              if (ok) nudged++; else failed++;
              captureSendEvent({ userId: profile.id, kind: 'engagement_nudge', success: !!ok });
            })
        );
      }

      await Promise.all(sendPromises);
    }

    res.json({ checked: totalChecked, nudged, failed });
  } catch (error) {
    sendError(res, 500, error, 'Engagement check');
  }
});

// ===== Start Server =====

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Sharp AI Backend running on port ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`);

  const keys = {
    Anthropic: !!process.env.ANTHROPIC_API_KEY,
    Groq: !!process.env.GROQ_API_KEY,
    ElevenLabs: !!process.env.ELEVENLABS_API_KEY,
  };
  console.log('  API Keys:');
  Object.entries(keys).forEach(([name, configured]) => {
    console.log(`    ${configured ? '✓' : '✗'} ${name}`);
  });
  console.log('');

  // ===== Cron: Engagement Check — runs daily at 8 PM UTC =====
  function scheduleEngagementCheck() {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(20, 0, 0, 0); // 8 PM UTC (~8 PM UK, ~3 PM ET)
    if (target <= now) target.setDate(target.getDate() + 1); // Already past today, schedule tomorrow
    const delay = target.getTime() - now.getTime();

    setTimeout(async () => {
      console.log('[CRON] Running engagement check...');
      try {
        const response = await fetch(`http://localhost:${PORT}/api/notifications/engagement-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const result = await response.json();
        console.log(`[CRON] Engagement check done: ${result.checked} checked, ${result.nudged} nudged`);
      } catch (e) {
        console.error('[CRON] Engagement check failed:', e.message);
      }
      // Schedule the next one
      scheduleEngagementCheck();
    }, delay);

    console.log(`  Engagement check scheduled in ${Math.round(delay / 1000 / 60)} minutes (8 PM UTC daily)`);
  }
  scheduleEngagementCheck();
});

// ===== Graceful Shutdown =====

function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down gracefully...`);
  // Flush PostHog buffer so the last batch of agent traces isn't lost on redeploy.
  agentTraces.shutdown().catch(() => {});
  server.close(() => {
    console.log('  Server closed.');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => {
    console.error('  Forcing exit — connections did not close in time.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
