require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const prompts = require('./prompts');

const app = express();

// CORS — restrict to known origins in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:8081', 'http://localhost:19006', 'exp://'];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return cb(null, true);
    cb(null, true); // Allow all for now — tighten after launch
  },
}));

app.use(express.json({ limit: '25mb' }));

// Rate limiting — per IP
const rateLimits = new Map();
function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const window = 60000;
    const hits = rateLimits.get(key) || [];
    const recent = hits.filter(t => now - t < window);
    if (recent.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    recent.push(now);
    rateLimits.set(key, recent);
    // Clean old entries every 100 requests
    if (rateLimits.size > 1000) {
      for (const [k, v] of rateLimits) {
        if (v.every(t => now - t > window)) rateLimits.delete(k);
      }
    }
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

// File upload handling
const upload = multer({ dest: 'uploads/' });

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
      console.error('Failed to parse Claude response:', cleaned.slice(0, 500));
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
    console.error('Agent research error:', e);
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
    console.error('Question generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Scoring =====

app.post('/api/score', async (req, res) => {
  try {
    if (!req.body?.transcript) {
      return res.status(400).json({ error: 'transcript is required' });
    }
    if (!req.body?.question) {
      return res.status(400).json({ error: 'question is required' });
    }
    const promptFn = req.body.isOnboarding ? prompts.onboardingScoringPrompt : prompts.scoringPrompt;
    const prompt = promptFn(req.body);
    const result = await callClaude(prompt, 2000);
    res.json(result);
  } catch (error) {
    console.error('Scoring error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Threaded Challenge: Follow-up =====

app.post('/api/threaded/follow-up', async (req, res) => {
  try {
    if (!req.body?.question || !req.body?.transcript) {
      return res.status(400).json({ error: 'question and transcript are required' });
    }
    const prompt = prompts.followUpPrompt(req.body);
    const result = await callClaude(prompt, 400);
    res.json(result);
  } catch (error) {
    console.error('Follow-up generation error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('Debrief error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Progress Summary =====

app.post('/api/progress/summary', async (req, res) => {
  try {
    const { progressData, roleText, currentCompany } = req.body;
    const prompt = `You are Sharp, a communication coach. Generate a 30-second spoken progress summary for your student.

THEIR DATA:
- Total sessions: ${progressData.totalSessions}
- Sessions this week: ${progressData.sessionsThisWeek} (last week: ${progressData.sessionsLastWeek})
- Current streak: ${progressData.currentStreak} days (best ever: ${progressData.longestStreak})
- Role: ${roleText || 'Not set'}
- Company: ${currentCompany || 'Not set'}

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
    console.error('Progress summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Transcription (Groq/Whisper) =====

const { execSync } = require('child_process');

app.post('/api/transcribe', async (req, res) => {
  const files = [];
  try {
    const { audio, filename } = req.body;
    console.log('Transcribe request received. Has audio:', !!audio, 'Body keys:', Object.keys(req.body));
    if (!audio) {
      return res.status(400).json({ error: 'No audio data. Send { audio: base64, filename: "recording.m4a" }' });
    }

    const buffer = Buffer.from(audio, 'base64');
    console.log('Decoded buffer size:', buffer.length, 'bytes');
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
      execSync(`afconvert "${rawPath}" "${wavPath}" -d LEI16 -f WAVE 2>/dev/null`, { timeout: 15000 });
      execSync(`ffmpeg -i "${wavPath}" -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y 2>/dev/null`, { timeout: 15000 });
      convertedPath = mp3Path;
      console.log('afconvert+ffmpeg success:', fs.statSync(rawPath).size, '→', fs.statSync(mp3Path).size);
    } catch (_) {
      // Approach 2: ffmpeg directly with -err_detect ignore_err (Linux, newer ffmpeg)
      try {
        execSync(`ffmpeg -err_detect ignore_err -i "${rawPath}" -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y 2>/dev/null`, { timeout: 15000 });
        if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 1000) {
          convertedPath = mp3Path;
          console.log('ffmpeg direct success:', fs.statSync(mp3Path).size);
        }
      } catch (__) {}

      // Approach 3: send raw M4A to Groq (some versions accept it)
      if (!convertedPath) {
        convertedPath = rawPath;
        console.log('Using raw M4A as fallback');
      }
    }

    resetUsageIfNewDay();
    apiUsage.groq.calls++;
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(convertedPath),
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'verbose_json',
    });

    // Cleanup
    files.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });

    res.json({
      transcript: transcription.text,
      duration: transcription.duration || 0,
    });
  } catch (error) {
    apiUsage.groq.errors++;
    console.error('Transcription error:', error.message || error);
    files.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    res.status(500).json({ error: error.message });
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
    console.error('Document parsing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Text-to-Speech (ElevenLabs) =====

app.get('/api/tts', async (req, res) => {
  try {
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    resetUsageIfNewDay();
    apiUsage.elevenlabs.calls++;
    apiUsage.elevenlabs.characters += String(text).length;

    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

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
      console.error('TTS stream error:', streamErr.message);
    } finally {
      if (!res.writableEnded) res.end();
    }

  } catch (error) {
    console.error('TTS error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

// ===== Start Server =====

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Sharp AI Backend running on port ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`);

  // Verify API keys
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
