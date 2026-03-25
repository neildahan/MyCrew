CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  persona_description TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  model_provider TEXT NOT NULL DEFAULT 'gemini',
  model_name TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
