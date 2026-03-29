require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const prompts = require('./prompts');

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
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return cb(null, true);
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
const MAX_TTS_TEXT = 1000;
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
  // Step 1: Claude decides what's interesting to search based on full user context
  const planPrompt = `You are a research agent for Sharp, a communication training app. Your job is to decide what industry news would be most interesting and relevant for this specific user.

USER CONTEXT:
- Role: ${context.roleText || 'Not specified'}
- Company: ${context.currentCompany || 'Not specified'}
- Situation: ${context.situationText || 'Not specified'}
- Dream role: ${context.dreamRoleAndCompany || 'Not specified'}
- Documents: ${context.documentExtractions?.length > 0 ? 'Has uploaded professional docs' : 'None'}

PREVIOUS QUESTIONS THEY'VE SEEN (avoid similar topics):
${(context.recentQuestions || []).slice(0, 5).map(q => `- "${q}"`).join('\n') || 'None yet'}

Think about what would be GENUINELY interesting for this person to discuss:
- What are their company's biggest competitors doing right now?
- What regulatory changes affect their industry?
- What technology shifts could disrupt their role?
- What are the career trends in their field?
- What controversial decisions are companies in their space making?
- What surprising data or research relates to their work?

Generate 4 DIVERSE search queries. Each should target a DIFFERENT angle:
1. One about their specific company or direct competitor
2. One about a broader industry trend or disruption
3. One about regulation, policy, or market dynamics in their space
4. One wildcard — something unexpected that connects to their role

Return ONLY valid JSON:
{
  "queries": ["<search query 1>", "<search query 2>", "<search query 3>", "<search query 4>"],
  "reasoning": "<1 sentence on why these are interesting for this person>"
}`;

  try {
    const plan = await callClaude(planPrompt, 300);
    if (!plan?.queries || !Array.isArray(plan.queries)) return [];

    // Step 2: Execute the searches in parallel
    const results = await Promise.all(
      plan.queries.slice(0, 4).map(q => searchGoogleNews(q))
    );

    // Combine, dedupe, and label with which query produced them
    const labeled = [];
    plan.queries.forEach((query, i) => {
      (results[i] || []).forEach(item => {
        labeled.push({ ...item, searchAngle: query });
      });
    });

    // Dedupe by title
    const seen = new Set();
    const unique = labeled.filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
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
    const result = await callClaude(prompt, 2000);
    res.json(result);
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

// ===== Text-to-Speech (ElevenLabs) =====

app.get('/api/tts', async (req, res) => {
  try {
    const { text } = req.query;
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

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.75,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      apiUsage.elevenlabs.errors++;
      const error = await response.text();
      throw new Error(`ElevenLabs error: ${error}`);
    }

    // Stream audio back to client with error handling
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
