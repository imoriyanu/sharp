# Sharp AI — Communication Training App

Sharp trains professionals to speak clearly, concisely, and with substance under pressure. Coaching is grounded in proven communication frameworks from 8 canonical books — but never cites them by name.

## Features (MVP)

- **Daily 30** — 30-second daily challenge, one question, score + insight
- **One Shot** — full coaching session with 5-dimension scoring and snippet coaching
- **Threaded Challenge** — 4-turn escalating follow-ups with thread debrief
- **Sharp Duels** — async 1v1 challenges, share results
- **Context** — role, company, situation, dream role, classified document uploads
- **Knowledge-grounded coaching** — invisible frameworks from communication science

## Tech Stack

- **Frontend**: React Native + Expo SDK 52, Expo Router, TypeScript
- **Backend**: Node.js + Express
- **AI**: Claude API (Sonnet) for all intelligence
- **Transcription**: Groq (Whisper)
- **TTS**: ElevenLabs (with device fallback)
- **Storage**: AsyncStorage (local, MVP)

## Design

Soft Dawn — light mode, warm cream (#FAF6F0), terracotta (#C07050) accent, sage (#5A9A5A) success.

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Paste your API keys in .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GROQ_API_KEY=gsk_...
#   ELEVENLABS_API_KEY=...

npm install
node server.js
# Running on http://localhost:3001
```

### 2. App (Fresh Expo project recommended)

Because Expo SDK versions can conflict with cached metro bundles, the cleanest approach is:

```bash
# Create a fresh Expo project
npx create-expo-app@latest sharp-fresh --template blank-typescript

# Copy Sharp's code into it
cp -r sharp-v2/app sharp-fresh/app
cp -r sharp-v2/src sharp-fresh/src
cp sharp-v2/app.json sharp-fresh/app.json

# Install dependencies
cd sharp-fresh
npx expo install expo-av expo-speech expo-document-picker expo-file-system \
  expo-haptics expo-router expo-status-bar expo-linking expo-constants \
  expo-sharing expo-clipboard \
  @react-native-async-storage/async-storage @expo/vector-icons \
  react-native-safe-area-context react-native-screens \
  react-native-reanimated react-native-gesture-handler

# Start
npx expo start
```

### 3. API Keys

| Service | Get key at | Env var |
|---------|-----------|---------|
| Claude (Anthropic) | console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` |
| Groq (Whisper) | console.groq.com/keys | `GROQ_API_KEY` |
| ElevenLabs (TTS) | elevenlabs.io/app/settings/api-keys | `ELEVENLABS_API_KEY` |

## Project Structure

```
app/
├── (tabs)/           # Home, History, Settings
├── daily/            # Daily 30 challenge + result
├── one-shot/         # Question, Recording, Results, Coaching
├── threaded/         # Follow-up, Debrief
├── duel/             # Create, Accept, Waiting, Results
├── context/          # Setup (4 fields), Documents
├── coming-soon/      # Conversation, Analytics
└── session/          # Session detail [id]

src/
├── constants/theme.ts   # Soft Dawn design system
├── types/index.ts       # All TypeScript types
└── services/            # API, storage, scoring, transcription, TTS

backend/
├── server.js            # Express server (6 routes)
├── prompts/index.js     # All Claude prompts
└── .env.example
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/question/generate` | POST | Generate contextual question |
| `/api/score` | POST | Score transcript (5 dimensions + coaching) |
| `/api/threaded/follow-up` | POST | Generate escalating follow-up |
| `/api/threaded/debrief` | POST | Full thread analysis |
| `/api/transcribe` | POST | Groq/Whisper transcription |
| `/api/document/parse` | POST | Classify + extract document |
| `/api/tts` | GET | ElevenLabs text-to-speech |

## Costs

| Mode | Cost per session |
|------|-----------------|
| Daily 30 | ~$0.009 |
| One Shot | ~$0.079 |
| Threaded | ~$0.328 |
| Duel (incremental) | ~$0.009 |
