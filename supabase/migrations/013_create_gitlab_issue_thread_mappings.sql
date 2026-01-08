-- Migration: Create GitLab issue to Feishu thread mappings
-- Enables auto-syncing Feishu thread replies as GitLab issue notes

CREATE TABLE IF NOT EXISTS gitlab_issue_thread_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Feishu thread info
  chat_id TEXT NOT NULL,                  -- Feishu chat ID
  root_id TEXT NOT NULL,                  -- Thread root message ID
  
  -- GitLab issue info
  project TEXT NOT NULL,                  -- e.g., "dpa/project-name"
  issue_iid INTEGER NOT NULL,             -- Issue IID within project
  issue_url TEXT NOT NULL,                -- Full URL to GitLab issue
  
  -- Metadata
  created_by TEXT NOT NULL,               -- Feishu user who created issue
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One issue per thread
  UNIQUE(chat_id, root_id)
);

-- Index for fast lookup by thread
CREATE INDEX IF NOT EXISTS idx_issue_thread_mapping_lookup 
  ON gitlab_issue_thread_mappings(chat_id, root_id);

-- Index for lookup by GitLab issue
CREATE INDEX IF NOT EXISTS idx_issue_thread_mapping_gitlab 
  ON gitlab_issue_thread_mappings(project, issue_iid);

COMMENT ON TABLE gitlab_issue_thread_mappings IS 'Maps Feishu threads to GitLab issues for auto-syncing replies as notes';
