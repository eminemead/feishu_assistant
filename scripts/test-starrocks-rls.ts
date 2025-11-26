#!/usr/bin/env bun
/**
 * Test StarRocks RLS Integration
 * 
 * Tests the StarRocks RLS truth table lookup with a real Feishu user ID
 * 
 * Usage:
 *   bun scripts/test-starrocks-rls.ts <feishu-user-id>
 * 
 * Example:
 *   bun scripts/test-starrocks-rls.ts "xiaofei.yin@nio.com"
 */

import { getUserDataScope } from '../lib/auth/user-data-scope';
import { feishuIdToEmpAccount } from '../lib/auth/feishu-account-mapping';

const feishuUserId = process.argv[2];

if (!feishuUserId) {
  console.error('❌ Please provide a Feishu user ID');
  console.error('   Usage: bun scripts/test-starrocks-rls.ts <feishu-user-id>');
  console.error('   Example: bun scripts/test-starrocks-rls.ts "xiaofei.yin@nio.com"');
  process.exit(1);
}

console.log('🧪 Testing StarRocks RLS Integration\n');
console.log(`Feishu User ID: ${feishuUserId}\n`);

async function testStarrocksRLS() {
  try {
    // Show the mapping
    const empAccount = feishuIdToEmpAccount(feishuUserId);
    console.log(`1️⃣  Feishu → Emp Account Mapping:`);
    if (empAccount) {
      console.log(`   ✅ Mapped to: ${empAccount}\n`);
    } else {
      console.log(`   ❌ Failed to map (expected format: emp_ad_account@nio.com)\n`);
      return;
    }

    // Get user data scope (queries StarRocks first, falls back to Supabase)
    console.log(`2️⃣  Querying StarRocks RLS table (evidence_rls_1d_a)...`);
    const scope = await getUserDataScope(feishuUserId);
    
    console.log(`\n3️⃣  Results:`);
    console.log(`   Allowed Accounts (project_code): ${scope.allowedAccounts.length}`);
    if (scope.allowedAccounts.length > 0) {
      scope.allowedAccounts.forEach((acc, i) => {
        console.log(`      ${i + 1}. ${acc}`);
      });
    } else {
      console.log(`      (none)`);
    }
    
    console.log(`\n   Allowed Regions (region_name): ${scope.allowedRegions.length}`);
    if (scope.allowedRegions.length > 0) {
      scope.allowedRegions.forEach((reg, i) => {
        console.log(`      ${i + 1}. ${reg}`);
      });
    } else {
      console.log(`      (none)`);
    }
    
    console.log(`\n   Allowed Departments: ${scope.allowedDepartments.length} (not in evidence_rls_1d_a)`);
    
    if (scope.allowedAccounts.length === 0 && scope.allowedRegions.length === 0) {
      console.log(`\n⚠️  No RLS data found in StarRocks for emp_ad_account=${empAccount}`);
      console.log(`   This could mean:`);
      console.log(`   - User doesn't exist in evidence_rls_1d_a table`);
      console.log(`   - Falled back to Supabase (which also has no data)`);
    } else {
      console.log(`\n✅ Successfully retrieved RLS data from StarRocks!`);
    }
    
  } catch (error: any) {
    console.error(`\n❌ Test failed:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testStarrocksRLS();

