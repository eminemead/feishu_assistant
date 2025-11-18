-- Migration: Create memory tables with user_id for RLS
-- These tables store agent memory data (working memory, messages, chats)
-- All tables have user_id column for Row Level Security (RLS) enforcement

-- Working memory table
-- Stores user preferences, learned facts, and context per scope
CREATE TABLE IF NOT EXISTS agent_working_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scope_id, key)
);

-- Messages table
-- Stores conversation history per user
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chats table
-- Stores chat metadata and titles per user
CREATE TABLE IF NOT EXISTS agent_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, chat_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_working_memory_user_id ON agent_working_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_working_memory_scope_id ON agent_working_memory(scope_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_user_id ON agent_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_id ON agent_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_chats_user_id ON agent_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_chats_chat_id ON agent_chats(chat_id);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_agent_working_memory_updated_at
  BEFORE UPDATE ON agent_working_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_chats_updated_at
  BEFORE UPDATE ON agent_chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

