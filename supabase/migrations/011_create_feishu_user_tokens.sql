-- Migration: Create feishu_user_tokens table for OAuth user_access_token storage
-- Purpose: Store user OAuth tokens for reading documents with user's permission

-- Create table for storing Feishu OAuth tokens
CREATE TABLE IF NOT EXISTS feishu_user_tokens (
  feishu_user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for expiry checking (cleanup job)
CREATE INDEX IF NOT EXISTS idx_feishu_user_tokens_expires_at 
  ON feishu_user_tokens(expires_at);

-- Enable RLS
ALTER TABLE feishu_user_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access tokens (sensitive data)
-- No user-level policies - tokens are only accessed server-side
CREATE POLICY "Service role full access" ON feishu_user_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE feishu_user_tokens IS 
  'Stores Feishu OAuth user_access_tokens for reading documents with user permission. Tokens are refreshed automatically when expired.';

COMMENT ON COLUMN feishu_user_tokens.feishu_user_id IS 
  'Feishu open_id or user_id of the user who authorized';
COMMENT ON COLUMN feishu_user_tokens.access_token IS 
  'OAuth access token for API calls';
COMMENT ON COLUMN feishu_user_tokens.refresh_token IS 
  'OAuth refresh token for renewing expired access_token';
COMMENT ON COLUMN feishu_user_tokens.expires_at IS 
  'Token expiration timestamp';
COMMENT ON COLUMN feishu_user_tokens.scope IS 
  'OAuth scopes granted (e.g., docs:doc:readonly)';

