-- Webhook subscriptions for document change tracking
-- Tracks which documents have webhooks registered and which chats receive notifications

CREATE TABLE IF NOT EXISTS doc_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL UNIQUE,
  doc_type TEXT NOT NULL DEFAULT 'doc',
  chat_id_to_notify TEXT NOT NULL,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  subscribed_by_user_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_doc_type CHECK (doc_type IN ('doc', 'docx', 'sheet', 'bitable', 'file'))
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_doc_webhooks_doc_token ON doc_webhooks(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_webhooks_chat_id ON doc_webhooks(chat_id_to_notify);
CREATE INDEX IF NOT EXISTS idx_doc_webhooks_active ON doc_webhooks(is_active);

-- Audit log for webhook events
CREATE TABLE IF NOT EXISTS doc_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL,
  event_type TEXT NOT NULL,
  change_type TEXT,
  modified_by_user_id TEXT,
  modified_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  raw_event JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_doc_token FOREIGN KEY (doc_token) REFERENCES doc_webhooks(doc_token) ON DELETE CASCADE
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_doc_webhook_events_doc_token ON doc_webhook_events(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_webhook_events_created_at ON doc_webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_doc_webhook_events_notification_sent ON doc_webhook_events(notification_sent);

-- RLS Policies (optional - for future user scoping)
-- For now, these tables are app-level (no user-specific RLS)
