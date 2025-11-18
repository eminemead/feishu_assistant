#!/usr/bin/env bun
/**
 * Supabase Setup Script
 * 
 * Helps set up Supabase project and run migrations
 * 
 * Usage:
 *   bun scripts/setup-supabase.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🚀 Supabase Setup Guide\n');

// Check if .env exists
const envPath = join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.log('❌ .env file not found. Please create one from .env.example\n');
  process.exit(1);
}

// Read .env file
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {
  SUPABASE_URL: envContent.match(/SUPABASE_URL=(.+)/)?.[1],
  SUPABASE_ANON_KEY: envContent.match(/SUPABASE_ANON_KEY=(.+)/)?.[1],
  SUPABASE_SERVICE_ROLE_KEY: envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1],
  SUPABASE_JWT_SECRET: envContent.match(/SUPABASE_JWT_SECRET=(.+)/)?.[1],
  SUPABASE_DATABASE_URL: envContent.match(/SUPABASE_DATABASE_URL=(.+)/)?.[1],
};

console.log('📋 Environment Variables Check:\n');
let allConfigured = true;
for (const [key, value] of Object.entries(envVars)) {
  if (value && value !== `your-${key.toLowerCase().replace(/_/g, '-')}`) {
    console.log(`  ✅ ${key}: Configured`);
  } else {
    console.log(`  ❌ ${key}: Not configured`);
    allConfigured = false;
  }
}

if (!allConfigured) {
  console.log('\n⚠️  Please configure all Supabase environment variables in .env file');
  console.log('   See .env.example for reference\n');
  process.exit(1);
}

console.log('\n✅ All environment variables are configured!\n');

// Check if migrations directory exists
const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
if (!existsSync(migrationsDir)) {
  console.log('❌ Migrations directory not found');
  process.exit(1);
}

console.log('📁 Migration files found:');
const migrations = ['001_create_memory_tables.sql', '002_create_rls_policies.sql', '003_create_user_permissions.sql'];
for (const migration of migrations) {
  const migrationPath = join(migrationsDir, migration);
  if (existsSync(migrationPath)) {
    console.log(`  ✅ ${migration}`);
  } else {
    console.log(`  ❌ ${migration} (missing)`);
  }
}

console.log('\n📝 Next Steps:\n');
console.log('1. Run migrations using Supabase CLI:');
console.log('   supabase db push\n');
console.log('   OR manually via SQL Editor:');
console.log('   - Go to Supabase Dashboard > SQL Editor');
console.log('   - Run each migration file in order (001, 002, 003)\n');
console.log('2. Verify tables were created:');
console.log('   - Check Supabase Dashboard > Table Editor');
console.log('   - Should see: agent_working_memory, agent_messages, agent_chats, user_data_permissions\n');
console.log('3. Test the integration:');
console.log('   bun scripts/test-supabase.ts\n');

