#!/usr/bin/env bun
/**
 * Publish local markdown to Feishu as rich-text message
 * 
 * Usage: bun run scripts/publish-to-feishu.ts <file.md>
 * 
 * Frontmatter:
 *   title: Article Title
 *   chat_id: oc_xxxxx
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { client } from '../lib/feishu-utils';
import { uploadImageToFeishu } from '../lib/feishu-image-utils';
import {
  extractImageRefs,
  markdownToFeishuPost,
  type FeishuPost,
} from '../lib/feishu/rich-text-builder';

const DEFAULT_CHAT_ID = 'oc_c6c0874d4020e0d3b48d1fce2b62656b'; // Data Product & Analytics Team

interface Frontmatter {
  title: string;
  chat_id?: string;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Markdown must have YAML frontmatter (---\\n...\\n---)');
  }

  const yamlBlock = match[1];
  const body = match[2];

  // Simple YAML parser for flat key: value
  const frontmatter: Record<string, string> = {};
  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }

  if (!frontmatter.title) {
    throw new Error('Frontmatter missing required field: title');
  }

  return {
    frontmatter: {
      title: frontmatter.title,
      chat_id: frontmatter.chat_id || DEFAULT_CHAT_ID,
    },
    body,
  };
}

async function uploadLocalImage(
  imagePath: string,
  baseDir: string
): Promise<string> {
  const fullPath = isAbsolute(imagePath) ? imagePath : resolve(baseDir, imagePath);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Image not found: ${fullPath}`);
  }

  const buffer = readFileSync(fullPath);
  console.log(`📤 Uploading image: ${fullPath}`);
  const imageKey = await uploadImageToFeishu(Buffer.from(buffer), 'message');
  console.log(`✅ Uploaded: ${imageKey}`);
  return imageKey;
}

async function sendPostMessage(
  chatId: string,
  post: FeishuPost
): Promise<string> {
  const resp = await client.im.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: chatId,
      msg_type: 'post',
      content: JSON.stringify(post),
    },
  });

  const isSuccess = resp.code === 0 || resp.code === undefined;
  if (!isSuccess || !resp.data?.message_id) {
    throw new Error(`Failed to send post message: ${JSON.stringify(resp)}`);
  }

  return resp.data.message_id;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: bun run scripts/publish-to-feishu.ts <file.md>');
    process.exit(1);
  }

  const filePath = resolve(args[0]);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const baseDir = dirname(filePath);
  const raw = readFileSync(filePath, 'utf-8');

  // Parse frontmatter
  const { frontmatter, body } = parseFrontmatter(raw);
  console.log(`📝 Title: ${frontmatter.title}`);
  console.log(`💬 Target chat: ${frontmatter.chat_id}`);

  // Extract and upload images
  const { cleanedMarkdown, images } = extractImageRefs(body);
  const imageKeyMap = new Map<string, string>();

  for (const img of images) {
    try {
      const imageKey = await uploadLocalImage(img.originalPath, baseDir);
      imageKeyMap.set(img.placeholder, imageKey);
    } catch (err) {
      console.error(`⚠️ Failed to upload ${img.originalPath}:`, err);
    }
  }

  // Build Feishu post
  const post = markdownToFeishuPost(cleanedMarkdown, frontmatter.title, imageKeyMap);

  // Send
  console.log(`📤 Sending to Feishu...`);
  const messageId = await sendPostMessage(frontmatter.chat_id, post);
  console.log(`✅ Published! message_id: ${messageId}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
