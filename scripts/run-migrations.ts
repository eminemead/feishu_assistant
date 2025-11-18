#!/usr/bin/env bun
/**
 * Run Supabase Migrations Script
 * 
 * Executes SQL migrations against Supabase database
 * 
 * Usage:
 *   bun scripts/run-migrations.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!SUPABASE_DATABASE_URL) {
  console.error('❌ SUPABASE_DATABASE_URL not set in environment variables');
  console.error('   Please set it in your .env file');
  process.exit(1);
}

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

async function runMigrations() {
  console.log('🚀 Running Supabase Migrations\n');

  // Get migration files in order
  const migrationFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.error('❌ No migration files found in supabase/migrations/');
    process.exit(1);
  }

  console.log(`📁 Found ${migrationFiles.length} migration file(s):\n`);
  for (const file of migrationFiles) {
    console.log(`   - ${file}`);
  }
  console.log('');

  // Connect to database
  const sql = postgres(SUPABASE_DATABASE_URL, { max: 1 });

  try {
    // Check if migrations table exists
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Get applied migrations
    const appliedMigrations = await sql`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    const appliedVersions = new Set(appliedMigrations.map((m: any) => m.version));

    // Run each migration
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');
      
      if (appliedVersions.has(version)) {
        console.log(`⏭️  Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`📝 Running ${file}...`);
      
      const migrationPath = join(migrationsDir, file);
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      try {
        // Execute migration
        await sql.unsafe(migrationSQL);
        
        // Record migration
        await sql`
          INSERT INTO schema_migrations (version) VALUES (${version})
        `;

        console.log(`   ✅ ${file} completed\n`);
      } catch (error: any) {
        console.error(`   ❌ ${file} failed: ${error.message}\n`);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully!\n');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();

