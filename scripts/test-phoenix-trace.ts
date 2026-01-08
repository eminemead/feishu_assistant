/**
 * Simple smoke test that runs the Feishu Assistant agent once and lets Mastra
 * send traces to Phoenix via the Arize exporter.
 *
 * Run: bun scripts/test-phoenix-trace.ts
 * Requires: Phoenix reachable at PHOENIX_ENDPOINT (see .env.example)
 */

import { mastra } from "../lib/observability-config";
import { getFeishuAssistantAgent } from "../lib/agents/feishu-assistant-agent";

async function main() {
  // Ensure Mastra + observability are initialized
  const agent = getFeishuAssistantAgent();

  console.log("🚀 Running Feishu Assistant agent smoke test...");
  const stream = await agent.stream([
    { role: "user", content: "Quick health check: say hello succinctly." },
  ]);

  let fullText = "";
  for await (const delta of stream.textStream) {
    fullText += delta;
  }

  console.log("✅ Agent response:", fullText.trim());
  console.log(
    "ℹ️ Check Phoenix UI for a new trace (service:",
    process.env.PHOENIX_PROJECT_NAME || "feishu-assistant",
    ", endpoint:",
    process.env.PHOENIX_ENDPOINT || "http://localhost:6006/v1/traces",
    ")"
  );
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
