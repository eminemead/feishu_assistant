#!/usr/bin/env bun
import { Client } from "@larksuiteoapi/node-sdk";

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new Client({
  id: process.env.FEISHU_APP_ID!,
  secret: process.env.FEISHU_APP_SECRET!,
});

const endpoints = [
  // Content endpoints (failing)
  { path: `/open-apis/docx/v1/document/${docId}/rawContent`, name: "docx/v1/rawContent" },
  { path: `/open-apis/docs/v2/document/${docId}/raw_content`, name: "docs/v2/raw_content" },
  
  // Metadata endpoints (working)
  { path: `/open-apis/suite/docs-api/meta`, name: "docs-api/meta", method: "POST", body: { docs_token: docId } },
  
  // Alternative metadata endpoints
  { path: `/open-apis/docx/v1/document/${docId}`, name: "docx/v1/meta" },
  { path: `/open-apis/docs/v2/document/${docId}`, name: "docs/v2/meta" },
];

async function testEndpoint(endpoint: any) {
  try {
    const start = Date.now();
    const response = await client.request({
      url: endpoint.path,
      method: endpoint.method || "get",
      data: endpoint.body,
      timeout: 5000,
    });
    const duration = Date.now() - start;
    
    console.log(`✅ ${endpoint.name.padEnd(30)} - ${duration}ms`);
    if (typeof response === 'object' && Object.keys(response).length < 5) {
      console.log(`   ${JSON.stringify(response).substring(0, 100)}`);
    }
    return { status: "success", duration };
  } catch (error: any) {
    const duration = Date.now() - (error.config?.timeout || 0);
    const code = error.code || error.response?.status || "unknown";
    const msg = error.message?.split('\n')[0] || error.response?.statusText || "error";
    console.log(`❌ ${endpoint.name.padEnd(30)} - ${code}: ${msg}`);
    return { status: "failed", code };
  }
}

async function main() {
  console.log("Testing Feishu API endpoints...\n");
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
}

main();
