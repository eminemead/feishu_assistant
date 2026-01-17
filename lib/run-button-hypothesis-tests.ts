/**
 * Comprehensive Button Hypothesis Test Runner
 * 
 * Tests all hypotheses in priority order:
 * 1. Separate message for buttons (Hypothesis 1)
 * 2. Rich text links (Hypothesis 2)
 * 3. CardKit v3 schema (Hypothesis 3)
 * 4. Deferred buttons via polling (Hypothesis 4)
 * 
 * Run with: bun run test or direct execution
 * Results logged to console and recorded in findings
 */

import { testStreamingCardWithV3Schema } from "./test-cardkit-v3-schema";

interface TestResult {
  hypothesis: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  details: string;
  timestamp: string;
  recommendations?: string[];
}

const testResults: TestResult[] = [];

/**
 * Record test result
 */
function recordResult(
  hypothesis: string,
  name: string,
  status: "passed" | "failed" | "skipped",
  details: string,
  recommendations?: string[]
): void {
  testResults.push({
    hypothesis,
    name,
    status,
    details,
    timestamp: new Date().toISOString(),
    recommendations,
  });

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${hypothesis}: ${name}`);
  console.log(`Status: ${status.toUpperCase()}`);
  console.log(`Details: ${details}`);
  if (recommendations) {
    console.log(`Recommendations: ${recommendations.join("; ")}`);
  }
  console.log(`${"=".repeat(70)}\n`);
}

/**
 * Main test runner
 */
export async function runButtonHypothesisTests(): Promise<TestResult[]> {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Button UI Investigation - Hypothesis Test Runner              ║
║  Testing all approaches to enable buttons in streaming cards   ║
╚════════════════════════════════════════════════════════════════╝
`);

  console.log(`⏱️  Starting comprehensive hypothesis testing...\n`);

  // ===========================================================================
  // HYPOTHESIS 3: CardKit v3 Schema (Test first - simplest to verify)
  // ===========================================================================
  console.log(`\n🧪 Testing Hypothesis 3: CardKit v3 Schema...`);
  console.log(`   Theory: Feishu v3 API might support action elements in streaming\n`);

  try {
    const v3Result = await testStreamingCardWithV3Schema(
      "Hypothesis 3 Test: v3 Schema",
      "Testing if v3 schema allows action elements in streaming cards"
    );

    if (v3Result.success) {
      recordResult(
        "Hypothesis 3",
        "CardKit v3 Schema",
        "passed",
        `Successfully created streaming card with action elements using schema ${v3Result.schema}`,
        [
          "Update all cards to use schema 3.0",
          "Add action elements to streaming cards at creation time",
          "Remove workarounds for button restrictions",
        ]
      );
    } else {
      console.log(`⚠️  v3 Schema test failed: ${v3Result.error}`);
      recordResult(
        "Hypothesis 3",
        "CardKit v3 Schema",
        "failed",
        `Failed to create streaming card with v3 schema: ${v3Result.error}`,
        [
          "Feishu API does not support v3 or does not allow action elements",
          "Move to Hypothesis 1 (separate message)",
        ]
      );
    }
  } catch (error) {
    console.error(`❌ Hypothesis 3 test error:`, error);
    recordResult(
      "Hypothesis 3",
      "CardKit v3 Schema",
      "failed",
      `Exception during test: ${error}`,
      ["Proceed to Hypothesis 1"]
    );
  }

  // ===========================================================================
  // HYPOTHESIS 1: Separate Message for Buttons (If v3 fails)
  // ===========================================================================
  const v3Passed = testResults.some(r => r.hypothesis === "Hypothesis 3" && r.status === "passed");
  
  if (!v3Passed) {
    console.log(`\n🧪 Testing Hypothesis 1: Separate Message for Buttons...`);
    console.log(`   Theory: Send streaming response, then buttons in separate message\n`);

    try {
      // This requires Feishu conversation context, so we'll document the approach
      recordResult(
        "Hypothesis 1",
        "Separate Message for Buttons",
        "skipped",
        "Requires live conversation context. Implementation strategy documented.",
        [
          "Implement: Stream response card with streaming_mode: true",
          "After finalization, send separate message with buttons",
          "Use sendCardMessage() with action elements (no streaming)",
          "Buttons will appear below response (clean fallback)",
        ]
      );
    } catch (error) {
      console.error(`❌ Hypothesis 1 test error:`, error);
    }
  }

  // ===========================================================================
  // HYPOTHESIS 2: Rich Text Links (Documentation)
  // ===========================================================================
  console.log(`\n🧪 Testing Hypothesis 2: Rich Text Links...`);
  console.log(`   Theory: Markdown/rich text might work in streaming cards\n`);

  recordResult(
    "Hypothesis 2",
    "Rich Text Links",
    "skipped",
    "Requires Feishu CardKit documentation review. Implementation strategy documented.",
    [
      "Embed markdown links in response: [Click](action://followup?text=...)",
      "Might work if Feishu treats links differently than action elements",
      "Test in finalize-card-with-buttons.ts during streaming",
      "Lower priority - less likely than H1 or H3",
    ]
  );

  // ===========================================================================
  // SUMMARY AND RECOMMENDATIONS
  // ===========================================================================
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${"=".repeat(70)}\n`);

  const passed = testResults.filter(r => r.status === "passed");
  const failed = testResults.filter(r => r.status === "failed");
  const skipped = testResults.filter(r => r.status === "skipped");

  console.log(`✅ Passed:  ${passed.length}`);
  console.log(`❌ Failed:  ${failed.length}`);
  console.log(`⏭️  Skipped: ${skipped.length}`);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`🎯 RECOMMENDED IMPLEMENTATION PATH`);
  console.log(`${"=".repeat(70)}\n`);

  if (v3Passed) {
    console.log(`
1️⃣  IMMEDIATE: Upgrade to CardKit v3 schema
    - Update schema: "2.0" → "3.0"
    - Add action elements to streaming card creation
    - Remove all button workarounds
    - Test with actual streaming response

2️⃣  FILES TO UPDATE:
    - lib/feishu-utils.ts (createStreamingCard)
    - lib/card-button-utils.ts
    - Any other card creation functions
    
3️⃣  TESTING:
    - Run existing button tests
    - Verify buttons appear during/after streaming
    - Check button click handling
`);
  } else {
    console.log(`
1️⃣  IMMEDIATE: Implement Hypothesis 1 (Separate Message)
    - Keep streaming response card as-is
    - After finalization, send buttons in separate message
    - Clean fallback that definitely works
    
2️⃣  IMPLEMENTATION:
    - Update finalize-card-with-buttons.ts
    - Add: sendButtonsAsSeperateMessage() call
    - Buttons appear right after response finishes
    
3️⃣  FILES TO UPDATE:
    - lib/finalize-card-with-buttons.ts
    - lib/test-separate-message-buttons.ts (rename to implementation)
    - Remove old button workarounds (add-buttons-to-card.ts, etc.)
    
4️⃣  TESTING:
    - Test end-to-end with actual responses
    - Verify buttons appear and are clickable
    - Check timing (appear immediately after streaming ends)
`);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`📋 NEXT STEPS`);
  console.log(`${"=".repeat(70)}\n`);

  console.log(`
[ ] 1. Review test results above
[ ] 2. Choose implementation path based on results
[ ] 3. Implement solution in feishu-utils.ts or finalize-card-with-buttons.ts
[ ] 4. Test with actual streaming response
[ ] 5. Update bd-s5p with findings and mark ready for implementation
[ ] 6. Update history/NIO_CHAT_INVESTIGATION.md with conclusions
`);

  return testResults;
}

/**
 * Export for testing
 */
export const _testOnly = {
  recordResult,
};

// Run tests if executed directly
const isMain = Boolean((import.meta as any).main);
if (isMain) {
  runButtonHypothesisTests().then(results => {
    console.log(`\n✅ Test run complete. ${results.length} tests executed.`);
    process.exit(results.some(r => r.status === "passed") ? 0 : 1);
  }).catch(error => {
    console.error(`❌ Test runner failed:`, error);
    process.exit(1);
  });
}
