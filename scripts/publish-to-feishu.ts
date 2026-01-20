#!/usr/bin/env bun
/**
 * Publish local markdown to Feishu as rich-text message.
 *
 * Usage:
 *   bun run scripts/publish-to-feishu.ts <file.md>
 *   bun run scripts/publish-to-feishu.ts --text "<message>" [--chat-id <id>]
 *   bun run scripts/publish-to-feishu.ts --markdown "<md>" --title "<title>" [--chat-id <id>]
 *   bun run scripts/publish-to-feishu.ts --text - [--chat-id <id>]         # stdin
 *   bun run scripts/publish-to-feishu.ts --markdown - --title "<title>" [--chat-id <id>]
 *   bun run scripts/publish-to-feishu.ts --text "<message>" --reactions "✅,🚧"
 *   bun run scripts/publish-to-feishu.ts --text "<message>" --no-reactions
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

const DEFAULT_CHAT_ID =
  process.env.FEISHU_PUBLISH_CHAT_ID ||
  'oc_c6c0874d4020e0d3b48d1fce2b62656b'; // Data Product & Analytics Team

interface Frontmatter {
  title: string;
  chat_id?: string;
}

interface CliArgs {
  filePath?: string;
  text?: string;
  markdown?: string;
  title?: string;
  chatId?: string;
  reactions?: string[];
  noReactions?: boolean;
  yes?: boolean;
  help?: boolean;
}

function printUsage() {
  console.log(`
Usage:
  bun run scripts/publish-to-feishu.ts <file.md>
  bun run scripts/publish-to-feishu.ts --text "<message>" [--chat-id <id>]
  bun run scripts/publish-to-feishu.ts --markdown "<md>" --title "<title>" [--chat-id <id>]
  bun run scripts/publish-to-feishu.ts --text - [--chat-id <id>]
  bun run scripts/publish-to-feishu.ts --markdown - --title "<title>" [--chat-id <id>]
  bun run scripts/publish-to-feishu.ts --text "<message>" --reactions "✅,🚧"
  bun run scripts/publish-to-feishu.ts --text "<message>" --no-reactions
  bun run scripts/publish-to-feishu.ts --text "<message>" -y              # skip confirmation
`);
}

function parseReactionList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--text" || arg === "--message" || arg === "-m") {
      const value = args[++i];
      if (!value) throw new Error("Missing value for --text");
      parsed.text = value;
    } else if (arg.startsWith("--text=") || arg.startsWith("--message=")) {
      parsed.text = arg.split("=").slice(1).join("=");
    } else if (arg === "--markdown" || arg === "--md") {
      const value = args[++i];
      if (!value) throw new Error("Missing value for --markdown");
      parsed.markdown = value;
    } else if (arg.startsWith("--markdown=") || arg.startsWith("--md=")) {
      parsed.markdown = arg.split("=").slice(1).join("=");
    } else if (arg === "--title" || arg === "-t") {
      const value = args[++i];
      if (!value) throw new Error("Missing value for --title");
      parsed.title = value;
    } else if (arg.startsWith("--title=")) {
      parsed.title = arg.split("=").slice(1).join("=");
    } else if (arg === "--chat-id" || arg === "--chat" || arg === "-c") {
      const value = args[++i];
      if (!value) throw new Error("Missing value for --chat-id");
      parsed.chatId = value;
    } else if (arg.startsWith("--chat-id=") || arg.startsWith("--chat=")) {
      parsed.chatId = arg.split("=").slice(1).join("=");
    } else if (arg === "--reactions" || arg === "--reaction" || arg === "--emoji") {
      const value = args[++i];
      if (!value) throw new Error("Missing value for --reactions");
      parsed.reactions = parseReactionList(value);
    } else if (arg.startsWith("--reactions=") || arg.startsWith("--reaction=") || arg.startsWith("--emoji=")) {
      parsed.reactions = parseReactionList(arg.split("=").slice(1).join("="));
    } else if (arg === "--no-reactions") {
      parsed.noReactions = true;
    } else if (arg === "-y" || arg === "--yes" || arg === "--force") {
      parsed.yes = true;
    } else if (!arg.startsWith("--") && !parsed.filePath) {
      parsed.filePath = arg;
    }
  }
  return parsed;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.trimEnd()));
    process.stdin.on("error", (err) => reject(err));
  });
}

async function confirmSend(preview: string, chatId: string): Promise<boolean> {
  console.log("\n" + "=".repeat(60));
  console.log("📋 PREVIEW");
  console.log("=".repeat(60));
  console.log(preview);
  console.log("=".repeat(60));
  console.log(`\n💬 Target: ${chatId}`);
  console.log("\n⚠️  Send this message to Feishu? [y/N] ");
  
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === "y" || answer === "yes");
    });
  });
}

async function resolveInlineInput(value: string, label: string): Promise<string> {
  if (value !== "-") {
    return value;
  }
  const stdinValue = await readStdin();
  if (!stdinValue.trim()) {
    throw new Error(`${label} stdin is empty`);
  }
  return stdinValue;
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
      chat_id: frontmatter.chat_id,
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

async function sendTextMessage(chatId: string, text: string): Promise<string> {
  const resp = await client.im.message.create({
    params: {
      receive_id_type: 'chat_id',
    },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });

  const isSuccess = resp.code === 0 || resp.code === undefined;
  if (!isSuccess || !resp.data?.message_id) {
    throw new Error(`Failed to send text message: ${JSON.stringify(resp)}`);
  }

  return resp.data.message_id;
}

const EMOJI_TYPE_MAP: Record<string, string> = {
  "✅": "OK",
};

function buildReactionType(reaction: string): { emoji_type?: string; emoji_id?: string } | null {
  const trimmed = reaction.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("emoji_id:")) {
    const emojiId = trimmed.slice("emoji_id:".length).trim();
    return emojiId ? { emoji_id: emojiId } : null;
  }
  if (lower.startsWith("emoji_type:")) {
    const emojiType = trimmed.slice("emoji_type:".length).trim();
    return emojiType ? { emoji_type: emojiType } : null;
  }

  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return { emoji_type: trimmed };
  }

  const mapped = EMOJI_TYPE_MAP[trimmed];
  if (mapped) return { emoji_type: mapped };

  return { emoji_type: trimmed };
}

async function addMessageReaction(messageId: string, reaction: string): Promise<void> {
  const reactionType = buildReactionType(reaction);
  if (!reactionType) return;

  const resp = await client.request({
    method: "POST",
    url: `/open-apis/im/v1/messages/${messageId}/reactions`,
    data: {
      reaction_type: reactionType,
    },
  });

  const isSuccess = resp.code === 0 || resp.code === undefined;
  if (!isSuccess) {
    throw new Error(`Failed to add reaction "${reaction}": ${JSON.stringify(resp)}`);
  }
}

async function addReactions(messageId: string, reactions: string[]): Promise<void> {
  if (reactions.length === 0) return;
  console.log(`🙂 Adding reactions: ${reactions.join(", ")}`);
  for (const reaction of reactions) {
    try {
      await addMessageReaction(messageId, reaction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ Failed to add reaction "${reaction}": ${msg}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.text && args.markdown) {
    throw new Error("Use --text or --markdown, not both");
  }

  if (args.text || args.markdown) {
    const chatId = args.chatId || DEFAULT_CHAT_ID;
    const reactions = args.noReactions
      ? []
      : (args.reactions || parseReactionList(process.env.FEISHU_PUBLISH_REACTIONS || "✅"));
    if (args.text) {
      const text = await resolveInlineInput(args.text, "Text");
      if (!text.trim()) {
        throw new Error("Text message is empty");
      }
      
      if (!args.yes) {
        const confirmed = await confirmSend(text, chatId);
        if (!confirmed) {
          console.log("❌ Cancelled.");
          process.exit(0);
        }
      }
      
      console.log(`💬 Target chat: ${chatId}`);
      console.log(`📤 Sending text...`);
      const messageId = await sendTextMessage(chatId, text);
      console.log(`✅ Published! message_id: ${messageId}`);
      await addReactions(messageId, reactions);
      return;
    }

    const markdown = await resolveInlineInput(args.markdown!, "Markdown");
    const title = args.title || "Ad-hoc Message";
    console.log(`📝 Title: ${title}`);
    console.log(`💬 Target chat: ${chatId}`);

    const { cleanedMarkdown, images } = extractImageRefs(markdown);
    const imageKeyMap = new Map<string, string>();

    for (const img of images) {
      try {
        const imageKey = await uploadLocalImage(img.originalPath, process.cwd());
        imageKeyMap.set(img.placeholder, imageKey);
      } catch (err) {
        console.error(`⚠️ Failed to upload ${img.originalPath}:`, err);
      }
    }

    const post = markdownToFeishuPost(cleanedMarkdown, title, imageKeyMap);
    
    if (!args.yes) {
      const previewText = `Title: ${title}\n\n${markdown}`;
      const confirmed = await confirmSend(previewText, chatId);
      if (!confirmed) {
        console.log("❌ Cancelled.");
        process.exit(0);
      }
    }
    
    console.log(`📤 Sending to Feishu...`);
    const messageId = await sendPostMessage(chatId, post);
    console.log(`✅ Published! message_id: ${messageId}`);
    await addReactions(messageId, reactions);
    return;
  }

  if (!args.filePath) {
    printUsage();
    process.exit(1);
  }

  const filePath = resolve(args.filePath);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const baseDir = dirname(filePath);
  const raw = readFileSync(filePath, 'utf-8');

  // Parse frontmatter
  const { frontmatter, body } = parseFrontmatter(raw);
  const chatId = args.chatId || frontmatter.chat_id || DEFAULT_CHAT_ID;
  const reactions = args.noReactions
    ? []
    : (args.reactions || parseReactionList(process.env.FEISHU_PUBLISH_REACTIONS || "✅"));
  console.log(`📝 Title: ${frontmatter.title}`);
  console.log(`💬 Target chat: ${chatId}`);

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

  // Confirm before sending
  if (!args.yes) {
    const previewText = `Title: ${frontmatter.title}\n\n${body.substring(0, 1000)}${body.length > 1000 ? "\n..." : ""}`;
    const confirmed = await confirmSend(previewText, chatId);
    if (!confirmed) {
      console.log("❌ Cancelled.");
      process.exit(0);
    }
  }

  // Send
  console.log(`📤 Sending to Feishu...`);
  const messageId = await sendPostMessage(chatId, post);
  console.log(`✅ Published! message_id: ${messageId}`);
  await addReactions(messageId, reactions);
}

main().catch((err) => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
