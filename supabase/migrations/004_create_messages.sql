CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  whatsapp_message_id TEXT,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX idx_messages_wa_dedup ON messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
