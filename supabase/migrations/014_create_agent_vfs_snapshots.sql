-- Migration: Create agent VFS snapshots table (just-bash persistence)
--
-- Purpose:
-- Persist per-thread virtual filesystem state for bash-tool tools (bash/readFile/writeFile).
-- This enables "filesystem as interface" (semantic-layer exploration) and replayable artifacts
-- across turns, without relying on AgentFS.
--
-- Notes:
-- - We store gzip-compressed JSON of a file map: { "/path/file": "content" }
-- - We key by (feishu_user_id, thread_id) to isolate per user + per conversation thread
-- - This table is intended for trusted backend access (service role). No RLS by default.

CREATE TABLE IF NOT EXISTS agent_vfs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feishu_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  file_count INTEGER NOT NULL DEFAULT 0,
  files_size_bytes INTEGER NOT NULL DEFAULT 0,
  files_sha256 TEXT NOT NULL DEFAULT '',
  files_gzip BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feishu_user_id, thread_id)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_agent_vfs_snapshots_user_thread
  ON agent_vfs_snapshots (feishu_user_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_agent_vfs_snapshots_updated_at
  ON agent_vfs_snapshots (updated_at);

-- Keep updated_at fresh
CREATE TRIGGER update_agent_vfs_snapshots_updated_at
  BEFORE UPDATE ON agent_vfs_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

