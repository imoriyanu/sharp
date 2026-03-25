# Sharp AI — Auth & Database Implementation Plan

> **Scope:** Add Apple Sign In + Supabase database to store user data
> **Prerequisite:** Current MVP with local AsyncStorage working
> **Estimated time:** 2-3 weeks

---

## What We're Building

1. **Apple Sign In** on the onboarding flow (after name screen)
2. **Supabase Postgres** to store all user data (sessions, scores, streaks, profile)
3. **Offline-first sync** — app still works without internet, syncs when connected
4. **Migration** — existing local data uploads to cloud on first sign-in

---

## Step-by-Step Implementation Order

### Step 1: Set Up Supabase Project (30 min)

1. Go to https://supabase.com → Create new project
2. Note down:
   - `SUPABASE_URL` (e.g., `https://xxxxx.supabase.co`)
   - `SUPABASE_ANON_KEY` (public, safe for frontend)
   - `SUPABASE_SERVICE_KEY` (secret, backend only)
   - `SUPABASE_JWT_SECRET` (for backend JWT verification)
3. Enable **Apple** auth provider in Supabase dashboard:
   - Authentication → Providers → Apple → Enable
   - Requires: Apple Developer account, Service ID, Key ID, Team ID
4. Add to `backend/.env`:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   SUPABASE_JWT_SECRET=your-jwt-secret
   ```

### Step 2: Create Database Tables (1 hour)

Run in Supabase SQL editor:

```sql
-- User profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User context
CREATE TABLE public.user_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_text TEXT DEFAULT '',
  current_company TEXT DEFAULT '',
  situation_text TEXT DEFAULT '',
  dream_role_and_company TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions
CREATE TABLE public.sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  scenario TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sessions_user ON public.sessions(user_id, created_at DESC);

-- Turns (child of sessions)
CREATE TABLE public.turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  question TEXT,
  question_reasoning TEXT,
  question_targets TEXT,
  question_difficulty INTEGER,
  transcript TEXT,
  recording_url TEXT,
  model_answer TEXT,
  scores JSONB,
  overall NUMERIC(3,1),
  summary TEXT,
  positives TEXT,
  improvements TEXT,
  coaching_insight TEXT,
  communication_tip TEXT,
  awareness_note TEXT,
  snippet JSONB,
  suggested_angles TEXT[],
  filler_words_found TEXT[],
  filler_count INTEGER DEFAULT 0,
  follow_up_targeting TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_turns_session ON public.turns(session_id);

-- Streaks
CREATE TABLE public.streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_session_date DATE,
  freezes_used DATE[] DEFAULT '{}',
  freezes_available INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Streak history
CREATE TABLE public.streak_history (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_date DATE NOT NULL,
  PRIMARY KEY(user_id, practice_date)
);

-- Unlocked badges
CREATE TABLE public.badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_day INTEGER NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, badge_day)
);

-- Daily results
CREATE TABLE public.daily_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC(3,1),
  insight TEXT,
  transcript TEXT,
  practice_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usage tracking
CREATE TABLE public.usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  one_shots INTEGER DEFAULT 0,
  threaded INTEGER DEFAULT 0,
  practice_again INTEGER DEFAULT 0,
  threaded_this_week INTEGER DEFAULT 0,
  week_start DATE,
  PRIMARY KEY(user_id, usage_date)
);

-- Question cache
CREATE TABLE public.question_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_date DATE NOT NULL,
  question_data JSONB NOT NULL,
  PRIMARY KEY(user_id, cache_date)
);

-- Recent questions (for variety)
CREATE TABLE public.recent_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security on ALL tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_questions ENABLE ROW LEVEL SECURITY;

-- RLS policies — users can only access their own data
CREATE POLICY "own_data" ON public.profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "own_data" ON public.user_context FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.turns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.streaks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.streak_history FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.badges FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.daily_results FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.usage FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.question_cache FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_data" ON public.recent_questions FOR ALL USING (user_id = auth.uid());

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, created_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), now());

  INSERT INTO public.streaks (user_id) VALUES (NEW.id);
  INSERT INTO public.user_context (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Step 3: Install Frontend Packages (15 min)

```bash
npx expo install @supabase/supabase-js expo-apple-authentication expo-crypto
npm install --legacy-peer-deps
```

### Step 4: Create Supabase Client (`src/services/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### Step 5: Create Auth Service (`src/services/auth.ts`)

```typescript
import { supabase } from './supabase';
import * as AppleAuthentication from 'expo-apple-authentication';

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (credential.identityToken) {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;

    // Update display name from Apple if available
    if (credential.fullName?.givenName) {
      await supabase.from('profiles').update({
        display_name: credential.fullName.givenName,
      }).eq('id', data.user.id);
    }

    return data;
  }
  throw new Error('No identity token');
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
```

### Step 6: Create Auth Context (`src/context/AuthContext.tsx`)

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';

type AuthState = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null, session: null, isLoading: true, isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, isLoading: true, isAuthenticated: false,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```

### Step 7: Add Sign In to Onboarding

**Where:** After the name screen (screen 2), before challenge intro (screen 3)

**New screen: `app/onboarding/signin.tsx`**

Shows:
- "Sign in to save your progress"
- **"Continue with Apple"** button (dark, Apple HIG compliant)
- "Skip for now" link (allows anonymous usage)

**Flow change:**
```
Welcome → Name → Sign In → Challenge Intro → Recording → Result → Value → Paywall → Welcome Home
```

If they skip sign-in, remind them later (after 3 sessions, after 7 sessions).

### Step 8: Create Sync Service (`src/services/sync.ts`)

**Strategy: Dual-write**

Every storage function writes to BOTH AsyncStorage (instant) AND Supabase (background):

```typescript
// Example: saving a session
export async function saveSession(session: Session) {
  // 1. Save locally (instant)
  await localSaveSession(session);

  // 2. Sync to cloud (background, non-blocking)
  syncToCloud('sessions', session).catch(console.warn);
}

async function syncToCloud(table: string, data: any) {
  const user = await getUser();
  if (!user) return; // Not signed in, skip cloud sync

  await supabase.from(table).upsert({
    ...data,
    user_id: user.id,
  });
}
```

### Step 9: Migration (Local → Cloud)

When a user signs in for the first time, run a one-time migration:

1. Read all AsyncStorage data
2. Upload to Supabase under the user's ID
3. Set `sharp:migration_complete = true`
4. From now on, dual-write handles everything

### Step 10: Update `_layout.tsx`

Wrap the app in `AuthProvider`:

```tsx
<AuthProvider>
  <OnboardingGate>
    <Stack>...</Stack>
  </OnboardingGate>
</AuthProvider>
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/services/supabase.ts` | Supabase client with AsyncStorage adapter |
| `src/services/auth.ts` | Apple Sign In, sign out, get user/session |
| `src/context/AuthContext.tsx` | React context for auth state |
| `src/services/sync.ts` | Dual-write (local + cloud) sync logic |
| `src/services/migration.ts` | One-time local → cloud data migration |
| `app/onboarding/signin.tsx` | Sign in screen in onboarding flow |

## Files to Modify

| File | Change |
|------|--------|
| `app/_layout.tsx` | Wrap in `AuthProvider` |
| `app/onboarding/name.tsx` | Navigate to signin instead of challenge-intro |
| `src/services/storage.ts` | Add dual-write calls to sync service |
| `app/(tabs)/settings.tsx` | Show signed-in email, sign out button |
| `backend/server.js` | Add JWT verification middleware |
| `backend/.env` | Add Supabase keys |

## Packages to Install

```bash
# Frontend
npx expo install @supabase/supabase-js expo-apple-authentication expo-crypto

# Backend
cd backend && npm install jsonwebtoken @supabase/supabase-js
```

---

## Apple Sign In Setup (Apple Developer Account)

1. Go to https://developer.apple.com/account
2. Certificates, IDs & Profiles → Identifiers → App IDs → your app
3. Enable "Sign In with Apple" capability
4. Create a Service ID for web-based sign in
5. Create a Key (Sign In with Apple key)
6. Note: Team ID, Key ID, Service ID
7. Add to Supabase dashboard: Authentication → Providers → Apple
8. Add to `app.json`:
```json
"ios": {
  "usesAppleSignIn": true
}
```

---

## Implementation Order

| # | Task | Duration | Dependency |
|---|------|----------|------------|
| 1 | Set up Supabase project + tables | 1 hour | None |
| 2 | Install packages | 15 min | None |
| 3 | Create `supabase.ts` client | 30 min | Step 1 |
| 4 | Create `auth.ts` + `AuthContext.tsx` | 2 hours | Step 3 |
| 5 | Apple Developer setup | 1 hour | Apple Dev account |
| 6 | Build signin screen | 2 hours | Steps 4, 5 |
| 7 | Wire into onboarding flow | 1 hour | Step 6 |
| 8 | Build sync service | 3 hours | Step 3 |
| 9 | Add dual-write to storage.ts | 3 hours | Step 8 |
| 10 | Build migration service | 2 hours | Steps 8, 9 |
| 11 | Update settings (email, sign out) | 1 hour | Step 4 |
| 12 | Backend JWT middleware | 2 hours | Step 1 |
| 13 | Test full flow | 2 hours | All |

**Total: ~20 hours of work**

---

## What This Unlocks

- Users sign in with Apple (one tap)
- Data persists across reinstalls and devices
- Profile, sessions, scores, streaks all in Supabase Postgres
- Row Level Security ensures users only see their own data
- App still works offline (AsyncStorage primary, cloud sync background)
- Foundation for RevenueCat subscription validation (server knows who's premium)
- Foundation for Sharp Duels (users have IDs to match against)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Apple rejects without Apple Sign In | It's the first auth method we're implementing |
| Migration loses local data | Keep AsyncStorage as backup for 30 days |
| Supabase outage | Offline-first — app works without cloud |
| Large migration (many sessions) | Show progress: "Syncing 47 sessions..." |
| JWT expiry during long session | Supabase SDK auto-refreshes tokens |
```

Ready to start? Tell me and I'll begin with Step 1 (Supabase client + auth service).
