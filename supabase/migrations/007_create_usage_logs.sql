CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL,
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_agent_date ON usage_logs(agent_id, created_at);
