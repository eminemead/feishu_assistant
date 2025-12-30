#!/usr/bin/env bun
/**
 * Observability Verification Script
 * 
 * Tests whether Mastra observability is working after agentfs & skill-based routing changes.
 * Sends test queries and checks if traces appear in Phoenix.
 */

import { mastra } from "../lib/observability-config";
import { CoreMessage } from "ai";

const PHOENIX_ENDPOINT = process.env.PHOENIX_ENDPOINT || "http://localhost:6006/v1/traces";
const PHOENIX_UI = "http://localhost:6006";

async function checkPhoenixHealth(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:6006/health");
    return response.ok;
  } catch {
    return false;
  }
}

async function testAgentCall(agentName: string, query: string) {
  console.log(`\n🧪 Testing ${agentName} with query: "${query}"`);
  
  try {
    const agent = mastra.getAgent(agentName);
    if (!agent) {
      console.error(`❌ Agent ${agentName} not found in Mastra instance`);
      return false;
    }
    
    const messages: CoreMessage[] = [
      { role: "user", content: query }
    ];
    
    const startTime = Date.now();
    const result = await agent.generate(messages);
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${agentName} responded (${duration}ms)`);
    console.log(`   Response length: ${result.text.length} chars`);
    return true;
  } catch (error) {
    console.error(`❌ ${agentName} failed:`, error);
    return false;
  }
}

async function main() {
  console.log("🔍 Observability Verification Test");
  console.log("=" .repeat(50));
  
  // Check Phoenix
  console.log("\n1. Checking Phoenix health...");
  const phoenixHealthy = await checkPhoenixHealth();
  if (!phoenixHealthy) {
    console.error("❌ Phoenix not accessible at http://localhost:6006");
    console.error("   Start with: docker compose -f docker-compose.phoenix.yml up -d");
    process.exit(1);
  }
  console.log("✅ Phoenix is running");
  console.log(`   Dashboard: ${PHOENIX_UI}`);
  console.log(`   Endpoint: ${PHOENIX_ENDPOINT}`);
  
  // Check observability config
  console.log("\n2. Checking Mastra observability config...");
  // Mastra agents are accessed via getAgent, not direct property access
  const agentNames = ["manager", "okrReviewer", "alignment", "pnl", "dpaMom"];
  const availableAgents: string[] = [];
  for (const name of agentNames) {
    try {
      const agent = mastra.getAgent(name);
      if (agent) availableAgents.push(name);
    } catch {
      // Agent not available
    }
  }
  console.log(`✅ Mastra instance has ${availableAgents.length} registered agents:`, availableAgents.join(", "));
  
  // Test different routing paths
  console.log("\n3. Testing agent calls through Mastra instance...");
  console.log("   (These should appear in Phoenix if observability is working)");
  
  const tests = [
    { agent: "manager", query: "Hello, what can you help with?" },
    { agent: "okrReviewer", query: "分析OKR指标覆盖率" },
    { agent: "dpaMom", query: "dpa team status" },
  ];
  
  let passed = 0;
  for (const test of tests) {
    const success = await testAgentCall(test.agent, test.query);
    if (success) passed++;
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed}/${tests.length} passed`);
  
  if (passed === tests.length) {
    console.log("\n✅ All agent calls succeeded!");
    console.log(`\n📈 Next steps:`);
    console.log(`   1. Open Phoenix dashboard: ${PHOENIX_UI}`);
    console.log(`   2. Look for traces with agent names: ${tests.map(t => t.agent).join(", ")}`);
    console.log(`   3. Verify spans show agent execution details`);
    console.log(`\n⚠️  If traces are missing, direct agent calls may not be traced.`);
    console.log(`   Check if manager-agent-mastra.ts uses mastra.agents.* pattern.`);
  } else {
    console.log("\n⚠️  Some tests failed. Check logs above.");
  }
}

main().catch(console.error);

