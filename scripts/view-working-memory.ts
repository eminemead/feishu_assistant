#!/usr/bin/env bun
/**
 * View Working Memory
 * 
 * Quick script to view/manage working memory in Supabase.
 * 
 * Usage:
 *   bun run scripts/view-working-memory.ts              # List all users
 *   bun run scripts/view-working-memory.ts <user_id>    # View specific user
 *   bun run scripts/view-working-memory.ts --reset <user_id>  # Reset user's memory
 */

import { getSharedStorage } from '../lib/memory-factory';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const userId = args.find(a => !a.startsWith('--'));

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (isReset && userId) {
    // Reset user's working memory
    const resourceId = userId.startsWith('user:') ? userId : `user:${userId}`;
    
    const { error: resErr } = await supabase
      .from('mastra_resources')
      .delete()
      .eq('id', resourceId);
    
    const { error: thrErr } = await supabase
      .from('mastra_threads')
      .delete()
      .eq('resourceId', resourceId);

    if (resErr || thrErr) {
      console.error('❌ Reset failed:', resErr || thrErr);
    } else {
      console.log(`✅ Reset working memory for ${resourceId}`);
      console.log('   Next message will auto-populate from Feishu API');
    }
    return;
  }

  if (userId) {
    // View specific user
    const resourceId = userId.startsWith('user:') ? userId : `user:${userId}`;
    
    const { data, error } = await supabase
      .from('mastra_resources')
      .select('*')
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      console.log(`❌ No working memory found for ${resourceId}`);
      return;
    }

    console.log(`\n📋 Working Memory for ${resourceId}`);
    console.log('─'.repeat(60));
    console.log(data.workingMemory || '(empty)');
    console.log('─'.repeat(60));
    console.log(`Updated: ${data.updatedAt}`);
    return;
  }

  // List all users with working memory
  const { data, error } = await supabase
    .from('mastra_resources')
    .select('id, updatedAt')
    .like('id', 'user:%')
    .order('updatedAt', { ascending: false })
    .limit(20);

  if (error) {
    console.error('❌ Query failed:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('📭 No working memory found for any users');
    return;
  }

  console.log('\n📋 Users with Working Memory:\n');
  console.log('ID'.padEnd(50) + 'Updated');
  console.log('─'.repeat(70));
  
  for (const row of data) {
    const id = row.id.length > 48 ? row.id.slice(0, 45) + '...' : row.id;
    console.log(`${id.padEnd(50)} ${row.updatedAt}`);
  }
  
  console.log('\n💡 Usage:');
  console.log('   bun run scripts/view-working-memory.ts <user_id>        # View details');
  console.log('   bun run scripts/view-working-memory.ts --reset <user_id> # Reset');
}

main().catch(console.error);
