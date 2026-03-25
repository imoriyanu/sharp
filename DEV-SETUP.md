# Sharp AI — Development Environment Setup

Complete guide to setting up your machine for Sharp AI development with Claude Code.

## Prerequisites

You need these installed before anything else:

### 1. Node.js 22 (LTS)

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart terminal, then:
nvm install 22
nvm use 22
node --version  # should show v22.x.x
```

### 2. Git

```bash
# macOS (comes with Xcode tools)
xcode-select --install

# Or with Homebrew
brew install git

# Verify
git --version
```

### 3. Expo CLI

```bash
# No global install needed — npx handles it
# But verify it works:
npx expo --version
```

### 4. Watchman (macOS, recommended)

```bash
brew install watchman
```

### 5. iOS Simulator (macOS only)

Install Xcode from the App Store. Then:
```bash
# Install iOS simulator
xcode-select --install
# Open Xcode → Settings → Platforms → Download iOS 18 simulator
```

### 6. Android Studio (optional, for Android)

Download from https://developer.android.com/studio
- Install Android SDK
- Set up an emulator (Pixel 8, API 35)
- Add to your shell profile:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

---

## Claude Code Installation

Claude Code is your primary development tool. It reads the entire codebase, edits files, runs commands, and manages git.

### Install

```bash
# macOS / Linux (native installer — recommended, no Node.js required)
curl -fsSL https://claude.ai/install.sh | sh

# Or via Homebrew
brew install claude-code

# Windows (PowerShell)
irm https://claude.ai/install.ps1 | iex

# Verify
claude --version
```

### Authenticate

```bash
claude
# Follow browser prompts to sign in
# Requires Claude Pro ($20/mo) or Max ($100+/mo)
```

### First run in Sharp project

```bash
cd sharp-v2
claude
# Claude will read CLAUDE.md automatically and understand the project
```

### Key Claude Code commands

```
/init          Generate/update CLAUDE.md by scanning codebase
/compact       Compress conversation history (use in long sessions)
/clear         Reset conversation (fresh start)
/review        Review staged git changes
/cost          Show token usage and costs
/bug           Report a bug to Anthropic
Shift+Tab      Toggle plan mode (think without writing code)
@filename      Reference a specific file
!command       Run a terminal command and feed output to Claude
```

### Install React Native Skills (optional but recommended)

```bash
# Callstack's official React Native best practices for Claude Code
claude
# Then inside Claude Code:
/plugin marketplace add callstackincubator/agent-skills
/plugin install react-native-best-practices@callstack-agent-skills
```

---

## Project Setup

### Option A: Use the codebase directly

```bash
# Extract the tar.gz
tar -xzf sharp-v2.tar.gz
cd sharp-v2

# Install app dependencies
npm install

# Install backend dependencies
cd backend
cp .env.example .env
# Edit .env with your API keys (see below)
npm install
cd ..

# Start
npx expo start         # App (in one terminal)
cd backend && node server.js  # Backend (in another terminal)
```

### Option B: Fresh Expo project (cleaner, recommended)

```bash
# Create fresh Expo project
npx create-expo-app@latest sharp --template blank-typescript
cd sharp

# Copy Sharp code
cp -r ../sharp-v2/app ./app
cp -r ../sharp-v2/src ./src
cp -r ../sharp-v2/backend ./backend
cp ../sharp-v2/app.json ./app.json
cp ../sharp-v2/CLAUDE.md ./CLAUDE.md
cp -r ../sharp-v2/.claude ./.claude

# Install all Expo dependencies
npx expo install \
  expo-av expo-speech expo-document-picker expo-file-system \
  expo-haptics expo-router expo-status-bar expo-linking \
  expo-constants expo-sharing expo-clipboard \
  @react-native-async-storage/async-storage \
  @expo/vector-icons \
  react-native-safe-area-context react-native-screens \
  react-native-reanimated react-native-gesture-handler

# Install backend
cd backend
cp .env.example .env
npm install
cd ..

# Start
npx expo start
```

---

## API Keys

You need 3 API keys. Get them here:

| Service | URL | Env var | Cost |
|---------|-----|---------|------|
| Anthropic (Claude) | console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` | ~$3/M input tokens |
| Groq (Whisper) | console.groq.com/keys | `GROQ_API_KEY` | ~$0.04/hr audio |
| ElevenLabs (TTS) | elevenlabs.io/app/settings/api-keys | `ELEVENLABS_API_KEY` | ~$5/mo starter |

Put them in `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
GROQ_API_KEY=gsk_xxxxx
ELEVENLABS_API_KEY=xxxxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
PORT=3001
```

**Never commit .env files.** Add to `.gitignore`:
```
backend/.env
```

---

## Git Setup

```bash
cd sharp
git init

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
.expo/
dist/
backend/.env
backend/uploads/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
.DS_Store
EOF

git add .
git commit -m "Initial Sharp AI codebase — Soft Dawn"
```

---

## Development Workflow with Claude Code

### Starting a session

```bash
cd sharp
claude
```

Claude reads CLAUDE.md automatically. Start with:
- "What's the current state of the app?" — Claude scans everything
- "Run the app and check for TypeScript errors" — catches issues
- "Let's work on the recording screen" — focused task

### Best practices

1. **Use plan mode first.** Press `Shift+Tab` to toggle plan mode. Let Claude think through the approach before writing code. Especially for multi-file changes.

2. **Reference files with @.** Instead of describing a file, point to it: "@app/one-shot/results.tsx — the coaching insight card needs better spacing"

3. **Compact often.** In sessions longer than 20 minutes, run `/compact` to summarise history and free context window. Without this, Claude progressively forgets CLAUDE.md conventions.

4. **One task at a time.** Don't ask "build the whole duel flow." Ask "build the duel create screen" → review → "now build the duel accept screen" → review.

5. **Let Claude run the app.** It can run `npx expo start`, `npx tsc --noEmit`, and check for errors. Use this to verify changes.

6. **Review before accepting.** Claude shows proposed changes before writing. Read them. Push back if something looks off.

---

## VS Code Setup (optional)

If you use VS Code alongside Claude Code:

```bash
# Install Claude Code extension
# Search "Claude Code" in VS Code extensions marketplace

# Recommended extensions for this project:
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss  # NOT for this project, skip
code --install-extension msjsdiag.vscode-react-native
```

VS Code settings for Sharp (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.tabSize": 2
}
```

---

## Testing on Device

### Expo Go (fastest, limited)

```bash
npx expo start
# Scan QR code with Expo Go app on your phone
```

### Development Build (full features, recommended)

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

### TestFlight (beta distribution)

```bash
# Build for iOS
eas build --platform ios --profile preview

# Submit to TestFlight
eas submit --platform ios
```

---

## Troubleshooting

### Metro bundler issues
```bash
npx expo start --clear
```

### TypeScript errors
```bash
npx tsc --noEmit
```

### iOS build fails
```bash
cd ios && pod install && cd ..
```

### Backend won't start
```bash
cd backend
cat .env  # Check keys are set
node -e "require('dotenv').config(); console.log(!!process.env.ANTHROPIC_API_KEY)"
```

### Recording permissions on device
Make sure `app.json` has the microphone permission. On physical devices, you must accept the permission prompt.
