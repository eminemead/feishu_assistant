-- Migration: Create document tracking tables
-- Enables persistent state for Feishu document change monitoring
-- Tracks which documents are being monitored and records all detected changes

-- Main table: documents being tracked
-- Stores configuration for which documents to monitor and where to send notifications
CREATE TABLE IF NOT EXISTS document_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_token TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('doc', 'sheet', 'bitable', 'docx')),
  chat_id_to_notify TEXT NOT NULL,
  title TEXT,
  owner_id TEXT,
  is_active BOOLEAN DEFAULT true,
  started_tracking_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified_user TEXT,
  last_modified_time BIGINT,
  last_notification_sent_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, doc_token)
);

-- Audit table: record of all detected changes
-- Maintains complete history of document changes for analytics and debugging
CREATE TABLE IF NOT EXISTS document_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_token TEXT NOT NULL,
  previous_modified_user TEXT,
  new_modified_user TEXT,
  previous_modified_time BIGINT,
  new_modified_time BIGINT,
  change_type TEXT CHECK (change_type IN ('time_updated', 'user_changed', 'new_document')),
  change_detected_at TIMESTAMPTZ DEFAULT NOW(),
  debounced BOOLEAN DEFAULT false,
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  notification_message_id TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Content snapshots table for advanced features (Phase 2)
-- Stores document content versions for diff analysis
-- WARNING: Can consume significant storage for large documents
CREATE TABLE IF NOT EXISTS document_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_token TEXT NOT NULL,
  revision_number BIGINT,
  content_hash TEXT NOT NULL,
  content_size BIGINT,
  modified_by TEXT NOT NULL,
  modified_at BIGINT NOT NULL,
  stored_at TIMESTAMPTZ DEFAULT NOW(),
  content_compressed BYTEA,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doc_token, revision_number)
);

-- Optional: Tracking rules table for Phase 2
-- Stores user-defined rules for conditional notifications
CREATE TABLE IF NOT EXISTS document_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_token TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  condition_type TEXT CHECK (condition_type IN ('any', 'modified_by', 'content_match', 'time_range')),
  condition_value TEXT,
  action_type TEXT CHECK (action_type IN ('notify', 'task', 'webhook', 'aggregate')),
  action_target TEXT,
  action_template TEXT,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, doc_token, rule_name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_tracking_user_id ON document_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_document_tracking_doc_token ON document_tracking(doc_token);
CREATE INDEX IF NOT EXISTS idx_document_tracking_chat_id ON document_tracking(chat_id_to_notify);
CREATE INDEX IF NOT EXISTS idx_document_tracking_is_active ON document_tracking(is_active);

CREATE INDEX IF NOT EXISTS idx_document_changes_user_id ON document_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_document_changes_doc_token ON document_changes(doc_token);
CREATE INDEX IF NOT EXISTS idx_document_changes_change_detected_at ON document_changes(change_detected_at);
CREATE INDEX IF NOT EXISTS idx_document_changes_notification_sent ON document_changes(notification_sent);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_user_id ON document_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_document_snapshots_doc_token ON document_snapshots(doc_token);
CREATE INDEX IF NOT EXISTS idx_document_snapshots_modified_at ON document_snapshots(modified_at);

CREATE INDEX IF NOT EXISTS idx_document_rules_user_id ON document_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_document_rules_doc_token ON document_rules(doc_token);
CREATE INDEX IF NOT EXISTS idx_document_rules_is_enabled ON document_rules(is_enabled);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_document_tracking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger to document_tracking
CREATE TRIGGER update_document_tracking_updated_at
  BEFORE UPDATE ON document_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_document_tracking_timestamp();

-- Add updated_at trigger to document_rules
CREATE TRIGGER update_document_rules_updated_at
  BEFORE UPDATE ON document_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_document_tracking_timestamp();

-- Enable Row Level Security (RLS)
ALTER TABLE document_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (similar pattern to other tables)
-- Users can only see their own tracked documents
CREATE POLICY document_tracking_select ON document_tracking
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY document_tracking_insert ON document_tracking
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_tracking_update ON document_tracking
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_tracking_delete ON document_tracking
  FOR DELETE
  USING (user_id = auth.uid());

-- Users can only see their own changes
CREATE POLICY document_changes_select ON document_changes
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY document_changes_insert ON document_changes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can only see their own snapshots
CREATE POLICY document_snapshots_select ON document_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY document_snapshots_insert ON document_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can only see/manage their own rules
CREATE POLICY document_rules_select ON document_rules
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY document_rules_insert ON document_rules
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_rules_update ON document_rules
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_rules_delete ON document_rules
  FOR DELETE
  USING (user_id = auth.uid());

-- Comments for documentation
COMMENT ON TABLE document_tracking IS 'Tracks which Feishu documents are being monitored for changes. One record per (user, doc_token) pair.';
COMMENT ON TABLE document_changes IS 'Audit trail of all detected changes. Used for analytics, debugging, and change history.';
COMMENT ON TABLE document_snapshots IS 'Optional storage of document content versions (Phase 2). Can be expensive - configure retention policy.';
COMMENT ON TABLE document_rules IS 'User-defined rules for conditional notifications and actions (Phase 2).';

COMMENT ON COLUMN document_tracking.doc_token IS 'Feishu document token (e.g., doccnXXXX)';
COMMENT ON COLUMN document_tracking.doc_type IS 'Document type: doc, sheet, bitable, or docx';
COMMENT ON COLUMN document_tracking.chat_id_to_notify IS 'Feishu group chat ID where notifications are sent';
COMMENT ON COLUMN document_tracking.is_active IS 'Whether tracking is currently active';
COMMENT ON COLUMN document_tracking.last_modified_user IS 'Cached user ID of last modifier (from latest Feishu metadata)';
COMMENT ON COLUMN document_tracking.last_modified_time IS 'Cached Unix timestamp of last modification (in seconds)';
COMMENT ON COLUMN document_changes.change_type IS 'Type of change: time_updated (modification time changed), user_changed (different user), new_document (first track)';
COMMENT ON COLUMN document_changes.debounced IS 'Whether this change was detected but notification was suppressed due to debouncing';
COMMENT ON COLUMN document_snapshots.content_compressed IS 'gzip-compressed document content (binary)';
