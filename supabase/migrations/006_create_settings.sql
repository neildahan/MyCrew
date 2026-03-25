CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
