CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  task_type TEXT NOT NULL,
  cron_expression TEXT,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}',
  target_whatsapp_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scheduled_due ON scheduled_tasks(next_run_at) WHERE is_active = true;
