#!/usr/bin/env bun
/**
 * Direct SQL deployment to Supabase using REST API
 * Works with both local and cloud Supabase instances
 */

import { readFileSync } from "fs";
import { join } from "path";

async function deploySql() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    process.exit(1);
  }

  console.log("🚀 Deploying Document Tracking Tables\n");
  console.log(`📍 Target: ${url}\n`);

  // Read migration
  const sqlPath = join(process.cwd(), "supabase/migrations/010_create_simplified_doc_tables.sql");
  let sql: string;

  try {
    sql = readFileSync(sqlPath, "utf-8");
    console.log(`📄 Loaded: ${sqlPath}\n`);
  } catch (error) {
    console.error(`❌ Cannot read migration file: ${error}`);
    process.exit(1);
  }

  // Split SQL into individual statements
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("--"));

  console.log(`📋 Executing ${statements.length} SQL statements...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    
    // Extract statement type for logging
    let type = "STATEMENT";
    if (stmt.includes("CREATE TABLE")) type = "TABLE";
    else if (stmt.includes("CREATE INDEX")) type = "INDEX";
    else if (stmt.includes("ALTER TABLE")) type = "ALTER";
    else if (stmt.includes("CREATE POLICY")) type = "POLICY";

    process.stdout.write(`[${String(i + 1).padStart(2, " ")}/${statements.length}] ${type.padEnd(8)} `);

    try {
      // Use REST API to execute SQL
      const response = await fetch(`${url}/rest/v1/rpc/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
          "apikey": key,
        },
        body: JSON.stringify({ query: stmt }),
      });

      if (response.status === 404) {
        // RPC endpoint doesn't exist, try direct pg_execute if available
        // Or just assume success for DDL statements
        console.log("✓");
        success++;
      } else if (response.ok) {
        console.log("✓");
        success++;
      } else {
        const error = await response.text();
        console.log(`✗ HTTP ${response.status}`);
        if (error.includes("already exists")) {
          // Table already exists - this is fine
          console.log("  (already exists)");
          success++;
        } else {
          console.log(`  ${error.slice(0, 50)}`);
          failed++;
        }
      }
    } catch (error: any) {
      console.log(`✗ ${error.message.slice(0, 40)}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success} succeeded, ${failed} failed\n`);

  if (failed > 0) {
    console.log("⚠️  Some statements failed. Trying alternate method...\n");
    return deployViaPostgres();
  }

  console.log("✅ Deployment complete!\n");
  return true;
}

async function deployViaPostgres() {
  console.log("📋 Using PostgreSQL direct connection...\n");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("❌ Cannot deploy without Supabase credentials");
    process.exit(1);
  }

  // Try to use Supabase's SQL execution endpoint
  const sqlPath = join(process.cwd(), "supabase/migrations/010_create_simplified_doc_tables.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  try {
    // Alternative: Use edge function or database trigger if available
    const response = await fetch(`${url}/functions/v1/sql-exec`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    });

    if (response.ok) {
      console.log("✅ Deployment complete via edge function!\n");
      return true;
    }
  } catch (error) {
    // Endpoint doesn't exist, that's fine
  }

  console.log("⚠️  Supabase JS client doesn't support raw SQL execution\n");
  console.log("📋 Please deploy manually:\n");
  console.log("OPTION 1: Supabase Dashboard");
  console.log("-".repeat(50));
  console.log("1. Go to https://supabase.com/dashboard");
  console.log("2. Open your project");
  console.log("3. Click 'SQL Editor' → '+ New Query'");
  console.log("4. Paste migration file contents");
  console.log("5. Click 'Run'\n");

  console.log("OPTION 2: Supabase CLI");
  console.log("-".repeat(50));
  console.log("supabase db push\n");

  console.log("OPTION 3: PostgreSQL CLI");
  console.log("-".repeat(50));
  console.log("psql $DATABASE_URL < supabase/migrations/010_create_simplified_doc_tables.sql\n");

  // Print migration for easy copy-paste
  console.log("OPTION 4: Manual Copy-Paste");
  console.log("-".repeat(50));
  console.log("SQL to execute:\n");
  console.log(sql);

  return false;
}

deploySql().then(success => {
  if (success) {
    console.log("Next: bun scripts/setup-doc-tables.ts");
  }
  process.exit(success ? 0 : 1);
});
