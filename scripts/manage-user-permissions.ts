#!/usr/bin/env bun
/**
 * User Permissions Management Script
 * 
 * Helps manage user data permissions in Supabase
 * 
 * Usage:
 *   bun scripts/manage-user-permissions.ts [command] [feishu-user-id] [options]
 * 
 * Commands:
 *   set <user-id> --accounts=account1,account2 --departments=dept1,dept2 --regions=region1,region2
 *   get <user-id>
 *   list
 */

import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';
import { getOrCreateSupabaseUser } from '../lib/auth/feishu-supabase-auth';

const command = process.argv[2];
const feishuUserId = process.argv[3];

const supabaseAdmin = createSupabaseAdminClient();

if (!supabaseAdmin) {
  console.error('❌ Supabase admin client not available. Check SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

async function setPermissions(userId: string, accounts?: string[], departments?: string[], regions?: string[]) {
  // Ensure Supabase user exists
  const supabaseUserId = await getOrCreateSupabaseUser(userId);
  if (!supabaseUserId) {
    console.error(`❌ Failed to create/get Supabase user for ${userId}`);
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from('user_data_permissions')
    .upsert({
      user_id: supabaseUserId,
      allowed_accounts: accounts || [],
      allowed_departments: departments || [],
      allowed_regions: regions || [],
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) {
    console.error(`❌ Failed to set permissions: ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ Permissions set for user ${userId}:`);
  console.log(`   Accounts: ${data.allowed_accounts?.length || 0}`);
  console.log(`   Departments: ${data.allowed_departments?.length || 0}`);
  console.log(`   Regions: ${data.allowed_regions?.length || 0}`);
}

async function getPermissions(userId: string) {
  const supabaseUserId = await getOrCreateSupabaseUser(userId);
  if (!supabaseUserId) {
    console.error(`❌ Failed to create/get Supabase user for ${userId}`);
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from('user_data_permissions')
    .select('*')
    .eq('user_id', supabaseUserId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`ℹ️  No permissions found for user ${userId}`);
      console.log('   Use "set" command to create permissions');
    } else {
      console.error(`❌ Failed to get permissions: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  console.log(`📋 Permissions for user ${userId}:`);
  console.log(`   Accounts: ${data.allowed_accounts?.join(', ') || 'None'}`);
  console.log(`   Departments: ${data.allowed_departments?.join(', ') || 'None'}`);
  console.log(`   Regions: ${data.allowed_regions?.join(', ') || 'None'}`);
}

async function listPermissions() {
  const { data, error } = await supabaseAdmin
    .from('user_data_permissions')
    .select('user_id, allowed_accounts, allowed_departments, allowed_regions')
    .order('user_id');

  if (error) {
    console.error(`❌ Failed to list permissions: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('ℹ️  No permissions found');
    return;
  }

  console.log(`📋 Found ${data.length} user(s) with permissions:\n`);
  for (const perm of data) {
    console.log(`   User ID: ${perm.user_id}`);
    console.log(`     Accounts: ${perm.allowed_accounts?.length || 0}`);
    console.log(`     Departments: ${perm.allowed_departments?.length || 0}`);
    console.log(`     Regions: ${perm.allowed_regions?.length || 0}\n`);
  }
}

// Parse command line arguments
function parseAccounts(accountsStr?: string): string[] {
  return accountsStr ? accountsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function parseDepartments(deptsStr?: string): string[] {
  return deptsStr ? deptsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function parseRegions(regionsStr?: string): string[] {
  return regionsStr ? regionsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
}

// Main
async function main() {
  if (command === 'set' && feishuUserId) {
    const accountsStr = process.argv.find(arg => arg.startsWith('--accounts='))?.split('=')[1];
    const deptsStr = process.argv.find(arg => arg.startsWith('--departments='))?.split('=')[1];
    const regionsStr = process.argv.find(arg => arg.startsWith('--regions='))?.split('=')[1];

    const accounts = parseAccounts(accountsStr);
    const departments = parseDepartments(deptsStr);
    const regions = parseRegions(regionsStr);

    await setPermissions(feishuUserId, accounts, departments, regions);
  } else if (command === 'get' && feishuUserId) {
    await getPermissions(feishuUserId);
  } else if (command === 'list') {
    await listPermissions();
  } else {
    console.log('Usage:');
    console.log('  bun scripts/manage-user-permissions.ts set <user-id> --accounts=acc1,acc2 --departments=dept1 --regions=region1');
    console.log('  bun scripts/manage-user-permissions.ts get <user-id>');
    console.log('  bun scripts/manage-user-permissions.ts list');
    process.exit(1);
  }
}

main().catch(console.error);

