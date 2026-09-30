-- Tasks: the shared store behind reminders and the morning digest.
--
-- This table already exists in the deployed database, created by hand before
-- migrations covered it, so everything here is written to be safe to run on
-- both a fresh database and the live one.
--
-- whatsapp_user_id is the OWNER (who gets reminded).
-- requested_by is the other person who asked for it (NULL = self-assigned),
-- which is what makes "what do I owe Inbal?" answerable.

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT,
  whatsapp_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'action',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  remind_at TIMESTAMPTZ,
  is_reminder_sent BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The column this migration actually adds to the existing table.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN tasks.whatsapp_user_id IS 'Owner: who must do it, and who gets the reminder.';
COMMENT ON COLUMN tasks.requested_by IS 'The other crew member who asked for it. NULL means self-assigned.';

-- Drives the reminders cron: due, unsent, still open.
CREATE INDEX IF NOT EXISTS idx_tasks_due_reminders ON tasks (remind_at)
  WHERE is_reminder_sent = false AND status IN ('pending', 'in_progress');

-- Drives "what's open for me" and the morning digest.
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status ON tasks (whatsapp_user_id, status, due_at);

-- Drives "what do I owe Inbal" / "what does Inbal owe me".
CREATE INDEX IF NOT EXISTS idx_tasks_requested_by ON tasks (requested_by, whatsapp_user_id)
  WHERE requested_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
