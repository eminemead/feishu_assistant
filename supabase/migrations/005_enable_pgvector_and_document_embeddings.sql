-- Migration: Enable pgvector extension and create document embeddings table
-- Enables vector similarity search for document RAG using Supabase PostgreSQL
-- Uses pgvector extension (available in Supabase Cloud by default)

-- Enable pgvector extension (if not already enabled)
-- Note: Supabase Cloud has pgvector enabled by default, but this ensures it's available
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: document_embeddings
-- Stores vector embeddings for tracked documents to enable semantic search
-- Each row represents one document with its embedding vector
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_token TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('doc', 'sheet', 'bitable', 'docx')),
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small uses 1536 dimensions
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, doc_token)
);

-- Create indexes for performance
-- Vector similarity search index (HNSW for fast approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector 
  ON document_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Standard indexes for filtering
CREATE INDEX IF NOT EXISTS idx_document_embeddings_user_id 
  ON document_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_doc_token 
  ON document_embeddings(doc_token);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_doc_type 
  ON document_embeddings(doc_type);

-- Create updated_at trigger
CREATE TRIGGER update_document_embeddings_updated_at
  BEFORE UPDATE ON document_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_document_tracking_timestamp();

-- Enable Row Level Security (RLS)
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own document embeddings
CREATE POLICY document_embeddings_select ON document_embeddings
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY document_embeddings_insert ON document_embeddings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_embeddings_update ON document_embeddings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY document_embeddings_delete ON document_embeddings
  FOR DELETE
  USING (user_id = auth.uid());

-- Comments for documentation
COMMENT ON TABLE document_embeddings IS 'Vector embeddings for tracked documents. Enables semantic search via pgvector.';
COMMENT ON COLUMN document_embeddings.doc_token IS 'Feishu document token (e.g., doccnXXXX)';
COMMENT ON COLUMN document_embeddings.embedding IS 'Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)';
COMMENT ON COLUMN document_embeddings.content IS 'Document content used to generate embedding (title, notes, metadata)';
COMMENT ON COLUMN document_embeddings.metadata IS 'Additional metadata (title, owner, last modified, etc.)';
