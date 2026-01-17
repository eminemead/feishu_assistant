#!/usr/bin/env bun
/**
 * Send an image to Feishu group
 * 
 * Usage: bun run scripts/send-image-to-feishu.ts <image.png> [chat_id]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { uploadImageToFeishu, sendImageMessage } from '../lib/feishu-image-utils';

const DEFAULT_CHAT_ID = 'oc_c6c0874d4020e0d3b48d1fce2b62656b'; // Data Product & Analytics Team

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: bun run scripts/send-image-to-feishu.ts <image.png> [chat_id]');
    process.exit(1);
  }

  const imagePath = resolve(args[0]);
  const chatId = args[1] || DEFAULT_CHAT_ID;

  if (!existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  console.log(`📤 Uploading image: ${imagePath}`);
  const buffer = readFileSync(imagePath);
  const imageKey = await uploadImageToFeishu(Buffer.from(buffer), 'message');
  console.log(`✅ Uploaded: ${imageKey}`);

  console.log(`📤 Sending to chat: ${chatId}`);
  const messageId = await sendImageMessage(chatId, 'chat_id', imageKey);
  console.log(`✅ Sent! message_id: ${messageId}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
