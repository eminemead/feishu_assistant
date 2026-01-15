#!/usr/bin/env bun
/**
 * Test TTS Voice Tool
 * 
 * Usage:
 *   bun scripts/test-tts-voice.ts preload          # Download model first
 *   bun scripts/test-tts-voice.ts <chat_id>        # Send test voice message
 *   bun scripts/test-tts-voice.ts <chat_id> "text" # Send custom text
 */

import { createTtsVoiceTool, preloadTtsModel } from "../lib/tools/tts-voice-tool";

async function main() {
  const arg1 = process.argv[2];
  
  if (!arg1) {
    console.log("TTS Voice Tool Test\n");
    console.log("Usage:");
    console.log("  bun scripts/test-tts-voice.ts preload          # Download model first");
    console.log("  bun scripts/test-tts-voice.ts <chat_id>        # Send test voice message");
    console.log('  bun scripts/test-tts-voice.ts <chat_id> "text" # Send custom text\n');
    console.log("First run 'preload' to download the TTS model (~300MB)");
    process.exit(1);
  }

  // Preload model
  if (arg1 === "preload") {
    console.log("Pre-loading TTS model (this downloads ~300MB on first run)...\n");
    const success = await preloadTtsModel();
    if (success) {
      console.log("\n✅ Model ready! You can now send voice messages.");
    } else {
      console.log("\n❌ Failed to download model. Check network/proxy settings.");
    }
    return;
  }

  // Send voice message
  const chatId = arg1;
  const customText = process.argv[3];
  
  const tool = createTtsVoiceTool(false);
  
  console.log("Testing TTS Voice Tool...\n");
  
  const testText = customText || "Hello! This is a test message from the Feishu AI assistant. The text to speech integration is working correctly.";
  
  console.log(`Text: "${testText}"`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Voice: af_heart (default)`);
  console.log(`Speed: 1.0 (default)`);
  console.log("\nGenerating and sending voice message...\n");

  const result = await tool.execute(
    {
      text: testText,
      chatId,
      voice: "af_heart",
      speed: 1.0,
    },
    undefined
  );

  console.log("\nResult:", JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log("\n✅ Voice message sent successfully!");
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Duration: ${result.duration}ms`);
  } else {
    console.log("\n❌ Failed to send voice message");
    console.log(`   Error: ${result.error}`);
  }
}

main().catch(console.error);
