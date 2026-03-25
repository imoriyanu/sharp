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
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Parse JSON response, stripping any markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse Claude response:', cleaned);
    throw new Error('Invalid JSON response from Claude');
  }
}

// ===== Health Check =====

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    },
  });
});

// ===== Question Engine =====

app.post('/api/question/generate', async (req, res) => {
  try {
    const prompt = prompts.questionEnginePrompt(req.body);
    const result = await callClaude(prompt, 800);
    res.json(result);
  } catch (error) {
    console.error('Question generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Scoring =====

app.post('/api/score', async (req, res) => {
  try {
    const promptFn = req.body.isOnboarding ? prompts.onboardingScoringPrompt : prompts.scoringPrompt;
    const prompt = promptFn(req.body);
    const result = await callClaude(prompt, 1500);
    res.json(result);
  } catch (error) {
    console.error('Scoring error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Threaded Challenge: Follow-up =====

app.post('/api/threaded/follow-up', async (req, res) => {
  try {
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

    // Two-step conversion: afconvert (M4A→WAV) then ffmpeg (WAV→MP3)
    // afconvert handles expo-audio's chnl box that ffmpeg can't parse
    // ffmpeg compresses WAV to small MP3 that Groq accepts
    const wavPath = rawPath.replace('_raw.m4a', '.wav');
    files.push(wavPath);
    let convertedPath = null;

    try {
      // Step 1: afconvert (macOS native) — M4A to WAV
      execSync(`afconvert "${rawPath}" "${wavPath}" -d LEI16 -f WAVE`, { timeout: 15000 });
      // Step 2: ffmpeg — WAV to compressed MP3
      execSync(`ffmpeg -i "${wavPath}" -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y 2>/dev/null`, { timeout: 15000 });
      convertedPath = mp3Path;
      console.log('Conversion success:', fs.statSync(rawPath).size, '→', fs.statSync(mp3Path).size, 'bytes');
    } catch (err) {
      console.error('Conversion failed:', err.message);
      // Last resort: try sending the WAV directly (if afconvert succeeded but ffmpeg failed)
      if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 0) {
        convertedPath = wavPath;
      } else {
        convertedPath = rawPath; // Will likely fail at Groq but at least we try
      }
    }

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
      const error = await response.text();
      throw new Error(`ElevenLabs error: ${error}`);
    }

    // Stream audio back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    });

    const reader = response.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message });
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
