#!/usr/bin/env bun
/**
 * Test lark-mcp document import and search capabilities
 */

import { spawn } from "child_process";
import { env } from "process";

async function testLarkMCP() {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET environment variables");
    process.exit(1);
  }

  console.log("Starting lark-mcp with credentials...");
  console.log(`App ID: ${appId.substring(0, 5)}...`);

  // Start lark-mcp in stdio mode with document preset
  const mcp = spawn("npx", [
    "@larksuiteoapi/lark-mcp",
    "mcp",
    "-a",
    appId,
    "-s",
    appSecret,
    "-t",
    "preset.doc.default",
  ]);

  let buffer = "";
  const tools: Record<string, unknown> = {};
  let initialized = false;

  return new Promise<void>((resolve, reject) => {
    // Handle MCP stderr (init messages)
    mcp.stderr?.on("data", (data) => {
      const message = data.toString();
      console.log("[MCP INIT]", message);
    });

    // Handle MCP stdout (tool definitions and responses)
    mcp.stdout?.on("data", (data) => {
      buffer += data.toString();

      // Try to parse JSON messages (MCP protocol)
      const lines = buffer.split("\n");
      buffer = lines[lines.length - 1];

      for (let i = 0; i < lines.length - 1; i++) {
        try {
          const json = JSON.parse(lines[i]);

          // Capture tool definitions
          if (json.result?.tools) {
            json.result.tools.forEach((tool: { name: string; description: string }) => {
              tools[tool.name] = tool.description;
              console.log(`✓ Tool available: ${tool.name}`);
            });
            initialized = true;
          }

          // Show responses
          if (json.result?.content) {
            console.log("[RESPONSE]", JSON.stringify(json.result.content, null, 2));
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    mcp.on("error", (err) => {
      console.error("MCP Error:", err);
      reject(err);
    });

    // Give it 5 seconds to initialize and show available tools
    setTimeout(() => {
      console.log("\n📋 Available Document Tools:");
      Object.entries(tools).forEach(([name, desc]) => {
        console.log(`  • ${name}: ${desc}`);
      });

      // Send test requests via stdin
      console.log("\n🧪 Testing document search...");
      const testRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "docx.builtin.search",
          arguments: {
            query: "test document",
            limit: 5,
          },
        },
      };

      mcp.stdin?.write(JSON.stringify(testRequest) + "\n");

      // Give it time to process
      setTimeout(() => {
        console.log("\n🧪 Testing document import...");
        const importRequest = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "docx.builtin.import",
            arguments: {
              title: "Test Import from MCP",
              content: "This is a test document imported via lark-mcp.",
            },
          },
        };

        mcp.stdin?.write(JSON.stringify(importRequest) + "\n");

        setTimeout(() => {
          console.log("\n✅ Test complete");
          mcp.kill();
          resolve();
        }, 3000);
      }, 2000);
    }, 2000);

    mcp.on("close", (code) => {
      console.log(`MCP process exited with code ${code}`);
      if (code !== 0 && !initialized) {
        reject(new Error(`MCP process exited with code ${code}`));
      }
    });
  });
}

testLarkMCP().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
