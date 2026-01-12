import { CoreMessage } from "ai";
import { fetchChatHistory } from "./tools/feishu-chat-history-tool";

function extractRequestedLimit(text: string): number | undefined {
  const m =
    text.match(/(?:最近|过去|last|past)\s*(\d{1,3})\s*(?:条|messages?|msgs?|msg)/i) ||
    text.match(/(?:context|上下文|情绪|sentiment)[^\d]{0,20}(\d{1,3})\s*(?:条|messages?|msgs?|msg)?/i);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(n, 1), 80);
}

function shouldPrefetch(text: string): boolean {
  const t = text.toLowerCase();
  const hasAt = /@[a-zA-Z0-9_.-]{3,}/.test(text);
  // Broad-but-safe trigger for the symptom: "analyze last N messages / sentiment / context"
  return (
    /(?:最近|过去|last|past)\s*\d{1,3}\s*(?:条|messages?|msgs?|msg)/i.test(text) ||
    /(情绪|sentiment|上下文|context|语境|总结|summarize|评价一下|分析一下|帮我分析)/i.test(text) ||
    // “最近的… + @某人” is very common; treat it as needing chat context.
    (hasAt && /(最近|recent|lately)/i.test(text))
  );
}

function extractTargetUserId(text: string): string | undefined {
  // After mention resolution, user mentions look like: @ou_xxx or @xiaofei.yin
  const m = text.match(/@([a-zA-Z0-9_.-]{3,})/);
  if (!m?.[1]) return undefined;
  const id = m[1];
  // skip obvious bot/app ids
  if (id.startsWith("cli_")) return undefined;
  return id;
}

function formatTranscript(messages: Array<{ createTime: string; isBot: boolean; sender?: any; content: string }>) {
  const lines: string[] = [];
  for (const msg of messages) {
    const ts = Number(msg.createTime);
    const time = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : msg.createTime;
    const who = msg.isBot ? "bot" : (msg.sender?.id ? `user:${msg.sender.id}` : "user");
    const content = (msg.content || "").replace(/\s+/g, " ").trim();
    if (!content) continue;
    lines.push(`- [${time}] (${who}) ${content}`);
  }
  return lines.join("\n");
}

/**
 * If the user asks for "last N messages / sentiment / context", prefetch chat history
 * and inject as a system message. This fixes the symptom without changing event policy.
 */
export async function maybeInjectRecentChatHistory(params: {
  chatId: string;
  userText: string;
  existingMessages: CoreMessage[];
}): Promise<CoreMessage[]> {
  const { chatId, userText, existingMessages } = params;

  if (!chatId || !shouldPrefetch(userText)) return existingMessages;

  const limit = extractRequestedLimit(userText) ?? 30;
  const senderId = extractTargetUserId(userText);

  const resp = await fetchChatHistory({ chatId, limit, senderId });
  if (!resp?.success || !resp.messages || resp.messages.length === 0) return existingMessages;

  const transcript = formatTranscript(resp.messages as any);
  if (!transcript) return existingMessages;

  const system: CoreMessage = {
    role: "system",
    content:
      `Recent Feishu chat messages (prefetched, up to ${limit}${senderId ? `, filtered by senderId=${senderId}` : ""}):\n` +
      transcript,
  };

  return [system, ...existingMessages];
}

