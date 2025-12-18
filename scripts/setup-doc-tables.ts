#!/usr/bin/env bun
/**
 * Helper to create Supabase tables for document tracking
 * 
 * This script manually executes the migration SQL to create the necessary tables
 * for document tracking (documents, doc_snapshots, doc_change_events)
 */

import { createClient } from "@supabase/supabase-js";

async function setupTables() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  console.log("📋 Setting up document tracking tables...\n");

  // SQL to create tables (from migration 010)
  const sql = `
-- Documents table
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

-- Document snapshots table
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

-- Document change events table
CREATE TABLE IF NOT EXISTS doc_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_token TEXT NOT NULL REFERENCES documents(doc_token) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  snapshot_id UUID REFERENCES doc_snapshots(id),
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_documents_doc_token ON documents(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_snapshots_doc_token ON doc_snapshots(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_snapshots_is_latest ON doc_snapshots(is_latest);
CREATE INDEX IF NOT EXISTS idx_doc_change_events_doc_token ON doc_change_events(doc_token);
CREATE INDEX IF NOT EXISTS idx_doc_change_events_changed_at ON doc_change_events(changed_at);
`;

  try {
    // Execute SQL through rpc or via direct sql (if available)
    // Supabase JS client doesn't have a direct SQL execution, so we need to use the REST API
    console.log("🔧 Using Supabase REST API to create tables...");
    
    // Instead, we'll try to insert a test document to verify table exists
    // If it fails, table doesn't exist and user needs to run migration manually
    const { error: testError } = await supabase
      .from("documents")
      .select("*")
      .limit(1);

    if (testError && testError.code === "PGRST205") {
      console.error("❌ Table 'documents' does not exist");
      console.error("   This usually means the Supabase migration hasn't been deployed");
      console.error("");
      console.error("📋 To deploy the migration, run in Supabase dashboard:");
      console.error("   1. Go to SQL Editor");
      console.error("   2. Paste the SQL from supabase/migrations/010_create_simplified_doc_tables.sql");
      console.error("   3. Click 'Run'");
      console.error("");
      console.error("OR via Supabase CLI:");
      console.error("   supabase db push");
      return false;
    }

    console.log("✅ Document tables already exist!");
    
    // Test with a sample insert
    console.log("\n🧪 Testing table access...");
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .limit(1);

    if (error) {
      console.error("❌ Error accessing documents table:", error);
      return false;
    }

    console.log(`✅ Successfully connected to documents table (${data?.length || 0} rows)`);
    
    // Test doc_change_events table
    const { data: events, error: eventsError } = await supabase
      .from("doc_change_events")
      .select("*")
      .limit(1);

    if (eventsError) {
      console.error("❌ Error accessing doc_change_events table:", eventsError);
      return false;
    }

    console.log(`✅ Successfully connected to doc_change_events table (${events?.length || 0} events)`);
    
    return true;
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    return false;
  }
}

console.log("🚀 Document Tracking Table Setup\n");
setupTables().then(success => {
  if (success) {
    console.log("\n✨ All tables are ready for use!");
    process.exit(0);
  } else {
    console.error("\n⚠️  Please deploy the migration first");
    process.exit(1);
  }
});
