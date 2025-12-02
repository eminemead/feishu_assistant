#!/usr/bin/env bun
/**
 * Test lark-mcp document operations via streamable (HTTP) mode
 */

import { spawn } from "child_process";
import { env } from "process";
import fs from "fs";

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testLarkMCPStreamable() {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("❌ Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
    process.exit(1);
  }

  console.log("🚀 Starting lark-mcp in streamable mode...");
  console.log(`   App ID: ${appId.substring(0, 5)}...`);
  console.log(`   Using preset: preset.doc.default\n`);

  // Start in streamable mode
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
    "streamable",
    "-p",
    "3001",
  ]);

  // Capture output for debugging
  let stderr = "";
  let stdout = "";

  mcp.stderr?.on("data", (data) => {
    stderr += data.toString();
    if (data.toString().includes("listen") || data.toString().includes("error")) {
      console.log("[MCP]", data.toString().trim());
    }
  });

  mcp.stdout?.on("data", (data) => {
    stdout += data.toString();
    console.log("[OUT]", data.toString().trim());
  });

  // Wait for server to start
  await delay(3000);

  try {
    // Test if server is responding
    console.log("\n📡 Checking if server is responding...");
    const healthResponse = await Promise.race([
      fetch("http://localhost:3001/", { timeout: 3000 }),
      delay(5000).then(() => {
        throw new Error("Server timeout");
      }),
    ]);

    console.log("✓ Server is running (status: " + healthResponse.status + ")");

    // Test 1: Try to get tool list
    console.log("\n📋 Getting available tools...");
    const toolsRes = await fetch("http://localhost:3001/tools", {
      method: "GET",
    });
    console.log("Tools endpoint status:", toolsRes.status);
    if (toolsRes.ok) {
      const tools = await toolsRes.json();
      console.log(`✓ Found tools:`, tools);
    }
  } catch (error) {
    console.error("❌ Server error:", error instanceof Error ? error.message : error);

    // Try calling via POST with tool invocation
    try {
      console.log("\n🔄 Trying alternative endpoint...");
      const testRes = await fetch("http://localhost:3001/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "tools/list",
        }),
      });
      console.log("Response status:", testRes.status);
      const data = await testRes.text();
      console.log("Response:", data.substring(0, 500));
    } catch (e) {
      console.error("Alternative endpoint also failed:", e instanceof Error ? e.message : e);
    }
  } finally {
    console.log("\n🛑 Stopping MCP service...");
    mcp.kill("SIGTERM");
    await delay(1000);

    if (stderr) {
      console.log("\n[Debug Info] Stderr:", stderr.substring(0, 500));
    }
    if (stdout) {
      console.log("[Debug Info] Stdout:", stdout.substring(0, 500));
    }
  }
}

testLarkMCPStreamable().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
