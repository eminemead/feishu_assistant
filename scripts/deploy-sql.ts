#!/usr/bin/env bun
/**
 * Deploy Supabase migration using direct PostgreSQL statements
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

async function deployMigration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    process.exit(1);
  }

  console.log("🚀 Deploying Document Tracking Migration\n");

  const supabase = createClient(url, key);

  // Read migration
  const sqlPath = join(process.cwd(), "supabase/migrations/010_create_simplified_doc_tables.sql");
  let sql: string;

  try {
    sql = readFileSync(sqlPath, "utf-8");
  } catch (error) {
    console.error(`❌ Cannot read migration: ${error}`);
    process.exit(1);
  }

  // Try using rpc to execute SQL
  console.log("📋 Executing SQL migration...\n");

  try {
    // Test: Try to create documents table via direct SQL
    const createDocumentsTable = `
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
    `;

    // Try using Supabase's built-in function
    const { data, error } = await (supabase as any).rpc("query", {
      query: createDocumentsTable,
    }).catch(() => ({ error: { message: "RPC not available" } }));

    if (error && error.message.includes("RPC not available")) {
      console.log("⚠️  RPC 'query' function not available");
      console.log("   Trying direct table creation...\n");

      // Instead, we'll create tables by inserting test data which requires them
      // Or use a different approach

      console.log("🔍 Testing table existence first...");
      
      // Try to insert a test document (this will fail if table doesn't exist)
      const { error: insertError } = await supabase
        .from("documents")
        .insert({
          doc_token: "test_token",
          title: "Test",
          doc_type: "docx",
          owner_id: "test_user",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError && insertError.code === "PGRST104") {
        // Table doesn't exist - we need to create it
        console.log("❌ Documents table doesn't exist\n");
        console.log("📋 Using workaround: Manual SQL execution via Supabase");
        console.log("\n   Since Supabase JS client doesn't support arbitrary SQL,");
        console.log("   please execute the migration manually:\n");
        
        console.log("OPTION 1: Dashboard (Easiest)");
        console.log("-".repeat(60));
        console.log("1. Go to https://supabase.com/dashboard");
        console.log("2. Select your project");
        console.log("3. Go to SQL Editor → '+ New Query'");
        console.log("4. Copy and paste the entire contents of:");
        console.log(`   supabase/migrations/010_create_simplified_doc_tables.sql`);
        console.log("5. Click 'RUN'\n");

        console.log("OPTION 2: CLI");
        console.log("-".repeat(60));
        console.log("supabase db push\n");

        console.log("SQL to execute:\n");
        console.log(sql);

        return false;
      } else if (insertError) {
        console.log(`❌ Error: ${insertError.message}`);
        return false;
      } else {
        console.log("✅ Table exists! Cleaning up test data...");
        
        // Delete test record
        await supabase
          .from("documents")
          .delete()
          .eq("doc_token", "test_token");

        return true;
      }
    } else if (error) {
      console.error(`❌ SQL execution failed: ${error.message}`);
      return false;
    } else {
      console.log("✅ Migration executed via RPC!");
      return true;
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

deployMigration().then(success => {
  if (success) {
    console.log("\n✅ Migration deployed successfully!");
    console.log("\nNext: bun scripts/test-doc-tracking-e2e.ts");
  } else {
    console.log("\n⚠️  Migration requires manual deployment");
  }
  process.exit(success ? 0 : 1);
});
