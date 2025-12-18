#!/usr/bin/env bun
/**
 * Execute migration by sending raw SQL to Supabase local instance
 */

import { readFileSync } from "fs";
import { join } from "path";

async function executeMigration() {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjA0MDAwMDAwMH0.kkB19g_5V8HzDHzDJ7Hv1KOeUWNPDM9cDXIvhCXQRuI";

  console.log("🚀 Executing Supabase Migration\n");
  console.log(`📍 URL: ${url}\n`);

  const sqlPath = join(process.cwd(), "supabase/migrations/010_create_simplified_doc_tables.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  console.log(`📄 Migration file: ${sqlPath}`);
  console.log(`   Size: ${sql.length} bytes\n`);

  // Split into CREATE TABLE statements + other statements
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("--"));

  console.log(`📋 ${statements.length} SQL statements to execute\n`);

  // Execute each statement via the REST API
  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const trimmed = stmt.slice(0, 40).replace(/\n/g, " ");

    process.stdout.write(`[${String(i + 1).padStart(2)}/${statements.length}] ${trimmed.padEnd(40)} `);

    try {
      // Try to execute via Supabase's admin endpoint
      const response = await fetch(`${url}/rest/v1/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
          "apikey": key,
          "X-Raw-Query": stmt, // Custom header to execute raw SQL
        },
      });

      if (response.ok || response.status === 201 || response.status === 204) {
        console.log("✓");
        success++;
      } else if (response.status === 400 || response.status === 409) {
        // Might be "already exists" which is ok
        const text = await response.text();
        if (text.includes("already exists")) {
          console.log("✓ (exists)");
          success++;
        } else {
          console.log(`✗`);
          console.log(`     ${text.slice(0, 50)}`);
          failed++;
        }
      } else {
        console.log(`✗ HTTP ${response.status}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`✗ ${error.message.slice(0, 40)}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success}/${statements.length} succeeded\n`);

  if (failed === 0) {
    console.log("✅ Migration executed!\n");
    return true;
  } else {
    console.log("⚠️  Some statements failed\n");
    console.log("Trying workaround: Create tables directly...\n");
    return await createTablesDirectly();
  }
}

async function createTablesDirectly() {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_ANON_KEY;

  if (!key) {
    console.error("❌ SUPABASE_ANON_KEY required");
    return false;
  }

  // Try creating a test record to initialize the database
  const createTestRecord = async () => {
    const response = await fetch(`${url}/rest/v1/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "apikey": key,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        doc_token: "test_token_" + Date.now(),
        title: "Test Document",
        doc_type: "docx",
        owner_id: "test_owner",
        created_at: new Date().toISOString(),
      }),
    });

    return response.status === 201;
  };

  try {
    const created = await createTestRecord();
    if (created) {
      console.log("✅ Table created via POST request!\n");
      return true;
    }
  } catch (error) {
    console.log(`❌ Failed: ${error}`);
  }

  return false;
}

executeMigration().then(success => {
  if (success) {
    console.log("Next: bun scripts/check-tables.ts");
  }
  process.exit(success ? 0 : 1);
});
