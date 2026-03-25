CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  whatsapp_user_id TEXT NOT NULL,
  whatsapp_user_name TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_user ON conversations(whatsapp_user_id);
