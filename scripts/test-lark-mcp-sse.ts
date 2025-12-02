#!/usr/bin/env bun
/**
 * Test lark-mcp document operations via SSE (HTTP) mode
 */

import { spawn } from "child_process";
import { env } from "process";

async function testLarkMCPSSE() {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
    process.exit(1);
  }

  console.log("🚀 Starting lark-mcp in SSE mode...");
  console.log(`   App ID: ${appId.substring(0, 5)}...`);
  console.log(`   Using tools: preset.doc.default`);

  // Start in SSE mode on port 3001 to avoid conflicts
  const mcp = spawn("npx", [
    "@larksuiteoapi/lark-mcp",
    "mcp",
    "-a",
    appId,
    "-s",
    appSecret,
    "-t",
    "preset.doc.default",
    "-m",
    "sse",
    "-p",
    "3001",
    "--debug",
  ]);

  // Wait for the server to be ready
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // Test 1: List tools
    console.log("\n📋 Getting available tools...");
    const toolsResponse = await fetch("http://localhost:3001/tools");
    if (!toolsResponse.ok) {
      throw new Error(`Failed to get tools: ${toolsResponse.status}`);
    }
    const tools = await toolsResponse.json();
    console.log(`✓ Found ${tools.length} tools`);
    tools.forEach((tool: { name: string; description: string }) => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });

    // Test 2: Search documents
    console.log("\n🔍 Testing document search...");
    const searchBody = {
      method: "tools/call",
      params: {
        name: "docx.builtin.search",
        arguments: {
          query: "*",
          limit: 5,
        },
      },
    };

    const searchResponse = await fetch("http://localhost:3001/tool_call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
    });

    const searchResult = await searchResponse.json();
    console.log("Search result:", JSON.stringify(searchResult, null, 2));

    // Test 3: Import document
    console.log("\n📝 Testing document import...");
    const importBody = {
      method: "tools/call",
      params: {
        name: "docx.builtin.import",
        arguments: {
          title: "MCP Test Document " + new Date().toISOString(),
          content: "This is a test document created via lark-mcp.\n\n# Heading\n\nSome content.",
        },
      },
    };

    const importResponse = await fetch("http://localhost:3001/tool_call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importBody),
    });

    const importResult = await importResponse.json();
    console.log("Import result:", JSON.stringify(importResult, null, 2));

    console.log("\n✅ Tests completed successfully!");
  } catch (error) {
    console.error("❌ Test error:", error);
  } finally {
    console.log("\n🛑 Stopping MCP service...");
    mcp.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

testLarkMCPSSE().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
