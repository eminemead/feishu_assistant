#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const docToken = "L7v9dyAvLoaJBixTvgPcecLqnIh";

async function fetchAndStoreDoc() {
  try {
    console.log(`📄 Fetching document: ${docToken}\n`);
    
    // Create Feishu client
    const client = new lark.Client({
      appId: process.env.FEISHU_APP_ID!,
      appSecret: process.env.FEISHU_APP_SECRET!,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // Try to fetch document content using the Node SDK
    // First, try the docx endpoint (most likely for online docs)
    let content: string | undefined;
    let contentType = "unknown";

    try {
      console.log("🔍 Trying docx.v1.document.rawContent...");
      const resp = await client.request({
        method: "GET",
        url: `/open-apis/docx/v1/document/${docToken}/rawContent`,
      }) as any;

      if (resp.code === 0 || resp.success?.() || resp.data) {
        content = resp.data?.content || JSON.stringify(resp.data);
        contentType = "docx";
        console.log("✅ Got docx content");
      }
    } catch (error: any) {
      console.log("⚠️  docx endpoint failed:", error.message?.slice(0, 100));
    }

    if (!content) {
      try {
        console.log("🔍 Trying doc.v2 rawContent...");
        const resp = await client.request({
          method: "GET",
          url: `/open-apis/doc/v2/${docToken}/rawContent`,
        }) as any;

        if (resp.code === 0 || resp.success?.() || resp.data) {
          content = resp.data?.content || JSON.stringify(resp.data);
          contentType = "doc";
          console.log("✅ Got doc v2 content");
        }
      } catch (error: any) {
        console.log("⚠️  doc v2 endpoint failed:", error.message?.slice(0, 100));
      }
    }

    if (!content) {
      throw new Error("Could not fetch document content from any endpoint");
    }

    console.log(`✅ Document fetched (type: ${contentType})!`);
    console.log(`Content length: ${content?.length || 0} characters\n`);
    
    if (content) {
      console.log("Preview (first 400 chars):");
      console.log(content.slice(0, 400));
      console.log("\n...\n");
    }

    // Store in Supabase if configured
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      console.log("📊 Storing in Supabase...");
      const supabase = createSupabaseClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      const { data, error } = await supabase
        .from("doc_snapshots")
        .upsert({
          doc_token: docToken,
          doc_type: contentType,
          content: content,
          fetched_at: new Date().toISOString(),
          is_latest: true,
        }, { onConflict: "doc_token" });

      if (error) {
        console.error("❌ Supabase error:", error);
      } else {
        console.log("✅ Stored in Supabase!");
      }
    } else {
      console.log("⚠️  Supabase not configured");
    }

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fetchAndStoreDoc();
