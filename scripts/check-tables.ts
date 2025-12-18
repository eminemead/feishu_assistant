#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log("🔍 Checking for existing tables...\n");
  
  const tables = ["documents", "doc_snapshots", "doc_change_events"];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(0);
      
      if (error) {
        console.log(`❌ ${table}: ${error.code || error.message}`);
      } else {
        console.log(`✅ ${table}: exists`);
      }
    } catch (e: any) {
      console.log(`❓ ${table}: ${e.message}`);
    }
  }
}

check();
