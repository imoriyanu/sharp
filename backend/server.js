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

// Security headers
app.use(helmet());

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

async function callClaude(prompt, maxTokens = 1500) {
  resetUsageIfNewDay();
  apiUsage.anthropic.calls++;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    // Track token usage
    if (response.usage) {
      apiUsage.anthropic.inputTokens += response.usage.input_tokens || 0;
      apiUsage.anthropic.outputTokens += response.usage.output_tokens || 0;
    }

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response — robust extraction
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try extracting JSON object from the text (Claude sometimes adds text before/after)
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {}
      }
      logError('Failed to parse Claude response:', cleaned.slice(0, 500));
      throw new Error('Invalid JSON response from Claude');
    }
  } catch (e) {
    apiUsage.anthropic.errors++;
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
    const plan = await callClaude(planPrompt, 200);
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

// ===== Question Engine =====

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
    const tokens = req.body.forceFormat === 'industry' ? 1500 : 1200;
    const result = await callClaude(prompt, tokens);
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
    const promptFn = req.body.isOnboarding ? prompts.onboardingScoringPrompt : prompts.scoringPrompt;
    const prompt = promptFn(req.body);

    // Score the answer
    const result = await callClaude(prompt, 2000);

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
      const evaluation = await callClaude(evalPrompt, 400);
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

app.post('/api/threaded/follow-up', async (req, res) => {
  try {
    if (!req.body?.question || !req.body?.transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }
    req.body.transcript = sanitizeString(req.body.transcript, MAX_TRANSCRIPT);
    req.body.question = sanitizeString(req.body.question, MAX_QUESTION);
    const prompt = prompts.followUpPrompt(req.body);
    const result = await callClaude(prompt, 400);
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Follow-up generation');
  }
});

// ===== Threaded Challenge: Debrief =====

app.post('/api/threaded/debrief', async (req, res) => {
  try {
    if (!req.body?.turns || !Array.isArray(req.body.turns)) {
      return res.status(400).json({ error: 'turns array is required' });
    }
    const prompt = prompts.debriefPrompt(req.body);
    const result = await callClaude(prompt, 2000);
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

    const result = await callClaude(prompt, 600);
    res.json(result);
  } catch (error) {
    sendError(res, 500, error, 'Progress summary');
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

// ===== RevenueCat Webhook =====

app.post('/api/webhooks/revenuecat', async (req, res) => {
  try {
    // Validate authorization header
    const authHeader = req.headers['authorization'];
    const expectedToken = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body?.event;
    if (!event) return res.status(400).json({ error: 'No event' });

    const appUserId = event.app_user_id;
    const eventType = event.type;

    log(`RevenueCat webhook: ${eventType} for user ${appUserId || 'unknown'}`);

    if (!supabase) {
      log('RevenueCat webhook: Supabase not configured, skipping DB update');
      return res.json({ ok: true });
    }

    // Only process events that change subscription status
    const activateEvents = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'];
    const deactivateEvents = ['EXPIRATION', 'BILLING_ISSUE'];

    if (activateEvents.includes(eventType) && appUserId) {
      await supabase.from('profiles').update({
        is_premium: true,
        updated_at: new Date().toISOString(),
      }).eq('id', appUserId);
    } else if (deactivateEvents.includes(eventType) && appUserId) {
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

// ===== Text-to-Speech (ElevenLabs) =====

// Voice modes — different settings for different coaching contexts
const VOICE_MODES = {
  // Default: natural, conversational — for questions and general speech
  question: {
    stability: 0.6,
    similarity_boost: 0.75,
    style: 0.2,
    use_speaker_boost: true,
  },
  // Coaching: warmer, slower, more considered — for feedback and insights
  coaching: {
    stability: 0.75,
    similarity_boost: 0.8,
    style: 0.1,
    use_speaker_boost: true,
  },
  // Model answer: crisp, authoritative — demonstrating sharp communication
  model: {
    stability: 0.7,
    similarity_boost: 0.85,
    style: 0.3,
    use_speaker_boost: true,
  },
  // Follow-up / pressure: slightly more assertive — interviewer energy
  followup: {
    stability: 0.55,
    similarity_boost: 0.7,
    style: 0.35,
    use_speaker_boost: true,
  },
  // Briefing: measured, news-anchor clarity
  briefing: {
    stability: 0.8,
    similarity_boost: 0.8,
    style: 0.15,
    use_speaker_boost: true,
  },
};

app.get('/api/tts', async (req, res) => {
  try {
    const { text, mode } = req.query;
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }
    if (String(text).length > MAX_TTS_TEXT) {
      return res.status(400).json({ error: 'Text too long' });
    }
    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return res.status(503).json({ error: 'TTS not configured' });
    }

    resetUsageIfNewDay();
    apiUsage.elevenlabs.calls++;
    apiUsage.elevenlabs.characters += String(text).length;

    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const voiceSettings = VOICE_MODES[mode] || VOICE_MODES.question;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: voiceSettings,
          optimize_streaming_latency: 3,
        }),
      }
    );

    if (!response.ok) {
      apiUsage.elevenlabs.errors++;
      const error = await response.text();
      throw new Error(`ElevenLabs error: ${error}`);
    }

    // Stream audio back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    });

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) res.write(value);
      }
    } catch (streamErr) {
      logError('TTS stream error:', streamErr.message);
    } finally {
      if (!res.writableEnded) res.end();
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

// Engagement check — called by cron or manually to nudge inactive users
app.post('/api/notifications/engagement-check', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    // Find users with push tokens who haven't had a session recently (paginated)
    const PAGE_SIZE = 100;
    let offset = 0;
    let totalChecked = 0;
    let nudged = 0;
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

    for (const profile of profiles) {
      if (!profile.push_token) continue;

      // Check their last session
      const { data: sessions } = await supabase
        .from('sessions')
        .select('created_at, type')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastSession = sessions?.[0];
      const daysSince = lastSession
        ? Math.floor((Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (daysSince < 1) continue; // Active today, skip

      // Check their streak
      const { data: streakData } = await supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', profile.id)
        .single();

      const streak = streakData?.current_streak || 0;

      // Check their best score
      const { data: bestTurn } = await supabase
        .from('turns')
        .select('overall')
        .eq('user_id', profile.id)
        .order('overall', { ascending: false })
        .limit(1);

      const bestScore = bestTurn?.[0]?.overall || 0;

      // Generate personalized nudge
      let title = '';
      let body = '';

      if (streak > 3 && daysSince === 1) {
        // Streak at risk — urgent
        title = `Your ${streak}-day streak is at risk`;
        body = 'One quick Daily Challenge keeps it alive. 60 seconds is all it takes.';
      } else if (daysSince >= 3) {
        // Been away — generate with Claude for personalization
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
          const nudge = await callClaude(nudgePrompt, 100);
          title = nudge?.title || 'Sharp misses you';
          body = nudge?.body || 'Your communication skills don\'t build themselves. One session?';
        } catch {
          title = 'Sharp misses you';
          body = 'Your communication skills don\'t build themselves. One quick session?';
        }
      } else if (daysSince >= 2) {
        title = 'Quick check-in';
        body = streak > 0
          ? `Your ${streak}-day streak is waiting. 60 seconds to keep it going.`
          : 'One Daily Challenge today? It only takes 60 seconds.';
      } else {
        continue; // Not inactive enough to nudge
      }

      const sent = await sendPushNotification(profile.push_token, title, body, { type: 'engagement_nudge' });
      if (sent) nudged++;
    }
    } // end while (hasMore)

    res.json({ checked: totalChecked, nudged });
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
