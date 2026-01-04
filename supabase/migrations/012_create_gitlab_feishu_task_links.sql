-- Migration: Create GitLab-Feishu task sync tables
-- Enables bidirectional sync between GitLab issues and Feishu tasks

-- Table to store the link between GitLab issues and Feishu tasks
CREATE TABLE IF NOT EXISTS gitlab_feishu_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- GitLab issue info
  gitlab_project TEXT NOT NULL,           -- e.g., "dpa/project-name"
  gitlab_issue_iid INTEGER NOT NULL,      -- Issue IID within project
  gitlab_issue_url TEXT,                  -- Full URL to GitLab issue
  
  -- Feishu task info
  feishu_task_guid TEXT NOT NULL UNIQUE,  -- Feishu task GUID
  feishu_task_url TEXT,                   -- URL to Feishu task
  
  -- Sync metadata
  created_by TEXT,                        -- Feishu open_id of creator
  assignee_feishu_open_id TEXT,           -- Feishu open_id of assignee
  assignee_gitlab_username TEXT,          -- GitLab username of assignee
  
  -- Status tracking
  gitlab_status TEXT DEFAULT 'opened',    -- opened, closed
  feishu_status TEXT DEFAULT 'todo',      -- todo, in_progress, done
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one link per GitLab issue
  UNIQUE(gitlab_project, gitlab_issue_iid)
);

-- Index for looking up by Feishu task GUID (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_gitlab_feishu_links_task_guid 
  ON gitlab_feishu_task_links(feishu_task_guid);

-- Index for looking up by GitLab issue
CREATE INDEX IF NOT EXISTS idx_gitlab_feishu_links_gitlab_issue 
  ON gitlab_feishu_task_links(gitlab_project, gitlab_issue_iid);

-- Table to cache Feishu user → GitLab username mappings
-- This supplements the simple email-stripping logic with explicit mappings
CREATE TABLE IF NOT EXISTS feishu_gitlab_user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feishu_open_id TEXT NOT NULL UNIQUE,    -- Feishu open_id
  feishu_user_id TEXT,                    -- Feishu user_id (email format)
  gitlab_username TEXT NOT NULL,          -- GitLab username
  display_name TEXT,                      -- Human-readable name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for reverse lookup (GitLab → Feishu)
CREATE INDEX IF NOT EXISTS idx_user_mappings_gitlab_username 
  ON feishu_gitlab_user_mappings(gitlab_username);

-- RLS policies (enable if using Supabase auth)
-- ALTER TABLE gitlab_feishu_task_links ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE feishu_gitlab_user_mappings ENABLE ROW LEVEL SECURITY;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_gitlab_feishu_task_links_updated_at ON gitlab_feishu_task_links;
CREATE TRIGGER update_gitlab_feishu_task_links_updated_at
  BEFORE UPDATE ON gitlab_feishu_task_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feishu_gitlab_user_mappings_updated_at ON feishu_gitlab_user_mappings;
CREATE TRIGGER update_feishu_gitlab_user_mappings_updated_at
  BEFORE UPDATE ON feishu_gitlab_user_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE gitlab_feishu_task_links IS 'Links GitLab issues to Feishu tasks for bidirectional sync';
COMMENT ON TABLE feishu_gitlab_user_mappings IS 'Maps Feishu users to GitLab usernames for task assignment';
