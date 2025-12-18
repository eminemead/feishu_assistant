#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const docToken = "L7v9dyAvLoaJBixTvgPcecLqnIh";

async function testDocMethods() {
  const client = new lark.Client({
    appId: process.env.FEISHU_APP_ID!,
    appSecret: process.env.FEISHU_APP_SECRET!,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  console.log("🔍 Testing available doc read methods...\n");

  // Check what methods are available on client.doc
  if (client.doc) {
    console.log("✅ client.doc available");
    const methods = Object.keys(client.doc).filter(k => typeof client.doc[k as keyof typeof client.doc] === 'object');
    console.log("Methods:", methods.slice(0, 5));
  }

  // Try different endpoints with better error handling
  const endpoints = [
    { name: "doc.v2.rawContent", path: `/open-apis/doc/v2/${docToken}/rawContent` },
    { name: "doc.v2.content", path: `/open-apis/doc/v2/${docToken}/content` },
    { name: "docx.v1.rawContent", path: `/open-apis/docx/v1/document/${docToken}/rawContent` },
    { name: "drive.file.meta", path: `/open-apis/drive/v1/files/${docToken}/meta` },
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n🔍 Trying ${endpoint.name}...`);
      const resp = await Promise.race([
        client.request({ method: "GET", url: endpoint.path }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout after 5s")), 5000)
        )
      ]) as any;

      console.log(`✅ ${endpoint.name} responded!`);
      if (resp.data) {
        const dataStr = JSON.stringify(resp.data).slice(0, 200);
        console.log(`Data: ${dataStr}`);
      }
    } catch (error: any) {
      const errMsg = error.message || error.code || "Unknown error";
      console.log(`❌ ${endpoint.name}: ${errMsg}`);
    }
  }
}

testDocMethods();
