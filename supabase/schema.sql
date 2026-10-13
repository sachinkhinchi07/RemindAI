-- ============================================================
-- ReMind AI — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- 1. USER PROFILES
-- Extends Supabase auth.users with app-specific fields
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name     TEXT,
  avatar_url    TEXT,
  timezone      TEXT DEFAULT 'UTC',
  onboarded     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────
-- 2. TASKS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  tags            TEXT[] DEFAULT '{}',
  assignee        TEXT,
  due_at          TIMESTAMPTZ,
  priority        TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status          TEXT CHECK (status IN ('pending', 'in_progress', 'queued', 'scheduled', 'blocked', 'done')) DEFAULT 'pending',
  risk_score      INT CHECK (risk_score BETWEEN 0 AND 100) DEFAULT 0,
  risk_label      TEXT,
  risk_reason     TEXT,
  is_routine      BOOLEAN DEFAULT FALSE,
  starred         BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 3. REMINDERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminders (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id         UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  remind_at       TIMESTAMPTZ NOT NULL,
  status          TEXT CHECK (status IN ('scheduled', 'snoozed', 'delivered', 'missed', 'dismissed')) DEFAULT 'scheduled',
  snooze_until    TIMESTAMPTZ,
  delivery_channels TEXT[] DEFAULT '{banner}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 4. USER SETTINGS / PREFERENCES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  quiet_hours_on    BOOLEAN DEFAULT TRUE,
  quiet_start       TIME DEFAULT '22:00',
  quiet_end         TIME DEFAULT '08:00',
  smart_throttle    BOOLEAN DEFAULT TRUE,
  buffer_time       TEXT DEFAULT '45m',
  channels          JSONB DEFAULT '{"banner": true, "desktop": true, "slack": true, "mobile": false}',
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
-- Users can only see and modify their own data
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings  ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tasks
CREATE POLICY "Users can CRUD own tasks" ON public.tasks
  FOR ALL USING (auth.uid() = user_id);

-- Reminders
CREATE POLICY "Users can CRUD own reminders" ON public.reminders
  FOR ALL USING (auth.uid() = user_id);

-- Settings
CREATE POLICY "Users can CRUD own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 6. AUTO-UPDATE updated_at timestamps
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tasks_updated_at     BEFORE UPDATE ON public.tasks     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_settings_updated_at  BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_profiles_updated_at  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
