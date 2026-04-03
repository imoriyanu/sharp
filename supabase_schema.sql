-- Sharp AI — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  onboarding_complete BOOLEAN DEFAULT false,
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User context
CREATE TABLE IF NOT EXISTS public.user_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_text TEXT DEFAULT '',
  current_company TEXT DEFAULT '',
  situation_text TEXT DEFAULT '',
  dream_role_and_company TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  scenario TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id, created_at DESC);

-- Turns
CREATE TABLE IF NOT EXISTS public.turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  question TEXT,
  transcript TEXT,
  model_answer TEXT,
  scores JSONB,
  overall NUMERIC(3,1),
  summary TEXT,
  positives TEXT,
  improvements TEXT,
  coaching_insight TEXT,
  communication_tip TEXT,
  snippet JSONB,
  filler_words_found TEXT[],
  filler_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Streaks
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_session_date DATE,
  freezes_available INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Badges
CREATE TABLE IF NOT EXISTS public.badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_day INTEGER NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, badge_day)
);

-- Daily results
CREATE TABLE IF NOT EXISTS public.daily_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC(3,1),
  insight TEXT,
  practice_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_results ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  CREATE POLICY "own_profiles" ON public.profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_context" ON public.user_context FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_sessions" ON public.sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_turns" ON public.turns FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_streaks" ON public.streaks FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_badges" ON public.badges FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_daily" ON public.daily_results FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-create profile + streak on sign up
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  raw_text TEXT,
  structured_extraction JSONB,
  summary TEXT,
  document_type TEXT NOT NULL,
  document_subtype TEXT,
  storage_path TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "own_documents" ON public.documents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Usage tracking (run this if not already created)
CREATE TABLE IF NOT EXISTS public.usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  one_shots INTEGER DEFAULT 0,
  threaded INTEGER DEFAULT 0,
  practice_again INTEGER DEFAULT 0,
  threaded_this_week INTEGER DEFAULT 0,
  week_start DATE,
  PRIMARY KEY(user_id, usage_date)
);
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_usage" ON public.usage FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
