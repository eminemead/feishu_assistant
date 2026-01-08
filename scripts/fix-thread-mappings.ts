/**
 * Script to fix thread-issue mappings where rootId was incorrectly set to chatId
 * 
 * Usage:
 *   bun scripts/fix-thread-mappings.ts list          # List all mappings
 *   bun scripts/fix-thread-mappings.ts fix <id> <correct_rootId>  # Fix a specific mapping
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listMappings() {
  const { data, error } = await supabase
    .from('gitlab_issue_thread_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching mappings:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('📭 No thread-issue mappings found');
    return;
  }

  console.log(`\n📋 Found ${data.length} mapping(s):\n`);
  
  for (const row of data) {
    const isSuspect = row.chat_id === row.root_id;
    const badge = isSuspect ? '⚠️  SUSPECT (rootId == chatId)' : '✅';
    
    console.log(`${badge}`);
    console.log(`  ID:        ${row.id}`);
    console.log(`  Chat ID:   ${row.chat_id}`);
    console.log(`  Root ID:   ${row.root_id}`);
    console.log(`  Project:   ${row.project}`);
    console.log(`  Issue:     #${row.issue_iid}`);
    console.log(`  URL:       ${row.issue_url}`);
    console.log(`  Created:   ${row.created_at}`);
    console.log(`  By:        ${row.created_by}`);
    console.log('');
  }

  const suspectCount = data.filter(r => r.chat_id === r.root_id).length;
  if (suspectCount > 0) {
    console.log(`\n⚠️  ${suspectCount} mapping(s) have rootId == chatId (likely incorrect)`);
    console.log(`   To fix: bun scripts/fix-thread-mappings.ts fix <id> <correct_rootId>`);
  }
}

async function fixMapping(id: string, correctRootId: string) {
  // First fetch the current mapping
  const { data: existing, error: fetchError } = await supabase
    .from('gitlab_issue_thread_mappings')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    console.error('❌ Mapping not found:', id);
    return;
  }

  console.log('\n📝 Current mapping:');
  console.log(`  Chat ID:   ${existing.chat_id}`);
  console.log(`  Root ID:   ${existing.root_id} (will be changed)`);
  console.log(`  Issue:     #${existing.issue_iid}`);
  
  console.log(`\n🔄 Updating root_id to: ${correctRootId}`);

  const { error: updateError } = await supabase
    .from('gitlab_issue_thread_mappings')
    .update({ root_id: correctRootId })
    .eq('id', id);

  if (updateError) {
    console.error('❌ Error updating mapping:', updateError);
    return;
  }

  console.log('✅ Mapping updated successfully!');
  console.log('\n   Now thread replies with this rootId will trigger gitlab_thread_update');
}

// Main
const command = process.argv[2];

if (command === 'list') {
  await listMappings();
} else if (command === 'fix') {
  const id = process.argv[3];
  const correctRootId = process.argv[4];
  
  if (!id || !correctRootId) {
    console.error('Usage: bun scripts/fix-thread-mappings.ts fix <id> <correct_rootId>');
    process.exit(1);
  }
  
  await fixMapping(id, correctRootId);
} else {
  console.log('Usage:');
  console.log('  bun scripts/fix-thread-mappings.ts list');
  console.log('  bun scripts/fix-thread-mappings.ts fix <id> <correct_rootId>');
}
