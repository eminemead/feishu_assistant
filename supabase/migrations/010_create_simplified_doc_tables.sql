-- Migration: Create simplified document storage tables
-- Stores document metadata, snapshots, and change events

-- Documents table: Core metadata
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL UNIQUE,
  title TEXT,
  doc_type TEXT CHECK (doc_type IN ('doc', 'docx', 'sheet', 'bitable', 'file')),
  owner_id TEXT,
  created_at TIMESTAMPTZ,
  last_modified_user TEXT,
  last_modified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document snapshots: Content versioning
CREATE TABLE IF NOT EXISTS doc_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL REFERENCES documents(doc_token) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER DEFAULT 1,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  is_latest BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document change events: Audit trail
CREATE TABLE IF NOT EXISTS doc_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL REFERENCES documents(doc_token) ON DELETE CASCADE,
  change_type TEXT NOT NULL, -- 'edit', 'rename', 'move', 'delete', etc.
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  snapshot_id UUID REFERENCES doc_snapshots(id),
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_doc_token ON documents(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_snapshots_doc_token ON doc_snapshots(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_snapshots_is_latest ON doc_snapshots(is_latest);
CREATE INDEX IF NOT EXISTS idx_doc_change_events_doc_token ON doc_change_events(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_change_events_changed_at ON doc_change_events(changed_at);

-- Enable RLS for security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_change_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow service role to manage all
CREATE POLICY documents_service_role ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY doc_snapshots_service_role ON doc_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY doc_change_events_service_role ON doc_change_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
