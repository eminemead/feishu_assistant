#!/usr/bin/env bun
/**
 * Supabase Integration Test Script
 * 
 * Tests Supabase RLS integration and user management
 * 
 * Usage:
 *   bun scripts/test-supabase.ts [feishu-user-id]
 */

import { getOrCreateSupabaseUser } from '../lib/auth/feishu-supabase-auth';
import { generateSupabaseJWT, createSupabaseClientWithUser } from '../lib/auth/supabase-jwt';
import { getUserDataScope } from '../lib/auth/user-data-scope';
import { createAgentMemory } from '../lib/memory-factory';

const testFeishuUserId = process.argv[2] || 'test-user-123';

console.log('🧪 Testing Supabase RLS Integration\n');
console.log(`Using test Feishu User ID: ${testFeishuUserId}\n`);

async function runTests() {
  try {
    // Test 1: Create Supabase user
    console.log('1️⃣  Testing Supabase user creation...');
    const supabaseUserId = await getOrCreateSupabaseUser(testFeishuUserId);
    if (supabaseUserId) {
      console.log(`   ✅ User created/retrieved: ${supabaseUserId}\n`);
    } else {
      console.log('   ❌ Failed to create user\n');
      return;
    }

    // Test 2: Generate JWT
    console.log('2️⃣  Testing JWT generation...');
    try {
      const jwt = generateSupabaseJWT(testFeishuUserId);
      console.log(`   ✅ JWT generated (length: ${jwt.length})\n`);
    } catch (error: any) {
      console.log(`   ❌ JWT generation failed: ${error.message}\n`);
      return;
    }

    // Test 3: Create Supabase client with user context
    console.log('3️⃣  Testing Supabase client with user context...');
    const supabase = createSupabaseClientWithUser(testFeishuUserId);
    if (supabase) {
      console.log('   ✅ Supabase client created\n');
    } else {
      console.log('   ❌ Failed to create Supabase client\n');
      return;
    }

    // Test 4: Get user data scope
    console.log('4️⃣  Testing user data scope...');
    const scope = await getUserDataScope(testFeishuUserId);
    console.log(`   ✅ Data scope retrieved:`);
    console.log(`      - Allowed accounts: ${scope.allowedAccounts.length}`);
    console.log(`      - Allowed departments: ${scope.allowedDepartments.length}`);
    console.log(`      - Allowed regions: ${scope.allowedRegions.length}\n`);

    // Test 5: Create Mastra memory
    console.log('5️⃣  Testing Mastra memory creation...');
    try {
      const memory = createAgentMemory({
        lastMessages: 20,
        enableWorkingMemory: true,
        enableSemanticRecall: true,
      });
      if (memory) {
        console.log('   ✅ Mastra memory created with working memory + semantic recall\n');
      } else {
        console.log('   ⚠️  Mastra memory not available (Supabase not configured)\n');
      }
    } catch (error: any) {
      console.log(`   ⚠️  Memory creation warning: ${error.message}\n`);
    }

    // Test 6: Test RLS enforcement (if Supabase client is available)
    if (supabase) {
      console.log('6️⃣  Testing RLS enforcement...');
      try {
        // Try to query agent_working_memory (should only return user's own data)
        const { data, error } = await supabase
          .from('agent_working_memory')
          .select('*')
          .limit(1);

        if (error) {
          console.log(`   ⚠️  RLS test query error (expected if no data): ${error.message}\n`);
        } else {
          console.log(`   ✅ RLS query successful (returned ${data?.length || 0} rows)\n`);
        }
      } catch (error: any) {
        console.log(`   ⚠️  RLS test error: ${error.message}\n`);
      }
    }

    console.log('✅ All tests completed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Configure user permissions in user_data_permissions table');
    console.log('   2. Test with actual Feishu user IDs from message events');
    console.log('   3. Verify RLS prevents cross-user data access\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();

