/**
 * Enhanced Document Commands - Phase 2
 *
 * Extends handle-doc-commands.ts with Phase 2 features:
 * - Snapshot history with diffs
 * - Rule management
 * - Advanced status queries
 */

import {
  getChangeHistoryWithDiffs,
  getDocumentSnapshotStats,
  pruneExpiredSnapshots,
} from "./doc-snapshot-integration";
import { getRulesEngine, setRulesEngineUserId } from "./rules-engine";
import {
  evaluateChangeRules,
  getRuleStatistics,
  EXAMPLE_RULES,
  initializeRulesSystem,
} from "./rules-integration";
import { getPersistence, setPersistenceUserId } from "./doc-persistence";
import { createAndSendStreamingCard } from "./feishu-utils";

/**
 * Extract doc token from text (reuse from main commands)
 */
function extractDocTokenFromUrl(input: string): {
  docToken: string;
  docType: string;
} | null {
  // Direct token format
  const directMatch = input.match(
    /^(docx?cn[a-zA-Z0-9]+|shtcn[a-zA-Z0-9]+|bitcn[a-zA-Z0-9]+)$/
  );
  if (directMatch) {
    const token = directMatch[1];
    let docType = "doc";
    if (token.startsWith("shtcn")) docType = "sheet";
    if (token.startsWith("bitcn")) docType = "bitable";
    if (token.startsWith("docxcn")) docType = "docx";
    return { docToken: token, docType };
  }

  // URL format
  const urlMatch = input.match(
    /https?:\/\/feishu\.cn\/(docs|sheets|bitable|docx)\/([a-zA-Z0-9]+)/
  );
  if (urlMatch) {
    const [, urlType, docToken] = urlMatch;
    const typeMap: Record<string, string> = {
      docs: "doc",
      sheets: "sheet",
      bitable: "bitable",
      docx: "docx",
    };
    return { docToken, docType: typeMap[urlType] || "doc" };
  }

  return null;
}

/**
 * Handle: @bot history <doc>
 * Show change history with diffs
 */
export async function handleHistoryCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    setPersistenceUserId(userId);

    // Extract doc token
    const match = text.match(/history\s+(.+?)(?:\s+|$)/i);
    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent:
          "Usage: `@bot history <doc_url_or_token>`\n\nExample: `@bot history doccnXXXXX`",
      });
      return;
    }

    const parsed = extractDocTokenFromUrl(match[1].trim());

    if (!parsed?.docToken) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Document",
        initialContent:
          "I couldn't parse the document. Please provide a Feishu URL or token.",
      });
      return;
    }

    // Get change history with diffs
    const history = await getChangeHistoryWithDiffs(parsed.docToken, 5);

    if (history.length === 0) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "📭 No Change History",
        initialContent: `Document ${parsed.docToken} has no recorded changes yet.`,
      });
      return;
    }

    // Format history
    let content = `**Change History for ${parsed.docToken}**\n\n`;

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const snapshot = entry.snapshot;
      const modTime = new Date(snapshot.modifiedAt * 1000).toLocaleString();

      content += `**[${i + 1}] Rev ${snapshot.revisionNumber}** - ${modTime}\n`;
      content += `Modified by: ${snapshot.modifiedBy}\n`;

      if (entry.diffSummary) {
        content += `Changes: ${entry.diffSummary}\n`;
      }

      content += "\n";
    }

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📜 Change History",
      initialContent: content,
    });

    console.log(
      `✅ [Commands] User ${userId} viewed history for ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling history command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to get history: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot snapshots <doc>
 * Show snapshot statistics
 */
export async function handleSnapshotsCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    setPersistenceUserId(userId);

    // Extract doc token
    const match = text.match(/snapshots\s+(.+?)(?:\s+|$)/i);
    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent:
          "Usage: `@bot snapshots <doc_url_or_token>`\n\nExample: `@bot snapshots doccnXXXXX`",
      });
      return;
    }

    const parsed = extractDocTokenFromUrl(match[1].trim());

    if (!parsed?.docToken) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Document",
        initialContent:
          "I couldn't parse the document. Please provide a Feishu URL or token.",
      });
      return;
    }

    // Get snapshot statistics
    const stats = await getDocumentSnapshotStats(parsed.docToken);

    const content = `**Snapshot Statistics for ${parsed.docToken}**

📊 **Storage**:
- Total snapshots: ${stats.totalSnapshots}
- Original size: ${(stats.totalOriginalSize / 1024).toFixed(1)} KB
- Compressed size: ${(stats.totalCompressedSize / 1024).toFixed(1)} KB
- Avg compression: ${stats.averageCompressionRatio.toFixed(2)}x

📅 **Timeline**:
- Oldest snapshot: ${stats.oldestSnapshot ? stats.oldestSnapshot.toLocaleString() : "N/A"}
- Newest snapshot: ${stats.newestSnapshot ? stats.newestSnapshot.toLocaleString() : "N/A"}

ℹ️ Old snapshots are automatically archived after 90 days.`;

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📦 Snapshot Statistics",
      initialContent: content,
    });

    console.log(
      `✅ [Commands] User ${userId} viewed snapshots for ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling snapshots command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to get snapshots: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot rules <doc>
 * List rules for a document
 */
export async function handleRulesCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    setRulesEngineUserId(userId);

    // Extract doc token
    const match = text.match(/rules\s+(.+?)(?:\s+|$)/i);
    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent:
          "Usage: `@bot rules <doc_url_or_token>`\n\nExample: `@bot rules doccnXXXXX`",
      });
      return;
    }

    const parsed = extractDocTokenFromUrl(match[1].trim());

    if (!parsed?.docToken) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Document",
        initialContent:
          "I couldn't parse the document. Please provide a Feishu URL or token.",
      });
      return;
    }

    // Get rules for document
    const rules = await getRulesEngine().getRulesForDoc(parsed.docToken);

    if (rules.length === 0) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "⚙️ No Rules",
        initialContent: `Document ${parsed.docToken} has no active rules.\n\nRules automatically trigger actions on detected changes.`,
      });
      return;
    }

    // Format rules
    let content = `**Rules for ${parsed.docToken}** (${rules.length} active)\n\n`;

    for (const rule of rules) {
      content += `📌 **${rule.name}**\n`;
      content += `   Condition: ${rule.condition.type}\n`;
      content += `   Action: ${rule.action.type}\n`;
      if (rule.action.target) {
        content += `   Target: ${rule.action.target}\n`;
      }
      content += `   Enabled: ${rule.enabled ? "✅" : "⊘"}\n\n`;
    }

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "⚙️ Document Rules",
      initialContent: content,
    });

    console.log(
      `✅ [Commands] User ${userId} viewed rules for ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling rules command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to get rules: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot rule:add <doc> <condition> <action> [target]
 * Create a new rule
 */
export async function handleRuleAddCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    setRulesEngineUserId(userId);

    // Parse: @bot rule:add <doc> <rule_type> [target]
    // Example: @bot rule:add doccnXXX notify oc_groupXXX
    const match = text.match(
      /rule:add\s+(\S+)\s+(\S+)(?:\s+(\S+))?/i
    );

    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent: `Usage: \`@bot rule:add <doc> <action_type> [target]\`

Action types:
- \`notify <chat_id>\` - Send notification to chat
- \`webhook <url>\` - Call webhook on change
- \`task\` - Create task
- \`aggregate\` - Hourly summary

Example: \`@bot rule:add doccnXXXX notify oc_groupXXX\``,
      });
      return;
    }

    const [, docInput, actionType, target] = match;

    const parsed = extractDocTokenFromUrl(docInput);

    if (!parsed?.docToken) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Document",
        initialContent:
          "I couldn't parse the document. Please provide a Feishu URL or token.",
      });
      return;
    }

    // Create rule
    const actionTarget = target || chatId; // Default to current chat

    const rule = await getRulesEngine().createRule(
      parsed.docToken,
      `Auto-created rule: ${actionType}`,
      { type: "any" },
      { type: actionType as any, target: actionTarget }
    );

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "✅ Rule Created",
      initialContent: `Created rule for ${parsed.docToken}:
- Action: ${rule.action.type}
- Target: ${rule.action.target || "default"}`,
    });

    console.log(
      `✅ [Commands] User ${userId} created rule for ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling rule:add command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to create rule: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot rules:status
 * Show overall rule statistics
 */
export async function handleRulesStatusCommand(
  chatId: string,
  userId: string
): Promise<void> {
  try {
    setRulesEngineUserId(userId);
    initializeRulesSystem(userId);

    const stats = await getRuleStatistics();

    let typesList = "";
    for (const [type, count] of Object.entries(stats.rulesByType)) {
      typesList += `- ${type}: ${count}\n`;
    }

    const content = `**Rules System Status**

📊 **Statistics**:
- Total rules: ${stats.totalRules}
- Enabled: ${stats.enabledRules}
- Disabled: ${stats.disabledRules}

📈 **By Action Type**:
${typesList}

✨ **Example Rules**:
- Notify on any change
- Notify specific user only
- Business hours only
- Create task on major changes
- Webhook trigger on change
- Hourly summary aggregation

Use \`@bot rule:add\` to create custom rules.`;

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "⚙️ Rules Status",
      initialContent: content,
    });

    console.log(`✅ [Commands] User ${userId} viewed rules status`);
  } catch (error) {
    console.error("Error handling rules:status command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to get rules status: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot tracking:advanced
 * Show advanced help for Phase 2 features
 */
export async function handleAdvancedHelpCommand(chatId: string): Promise<void> {
  const helpText = `🚀 **Advanced Document Tracking - Phase 2**

**Snapshots & Diffs**
\`@bot history <doc>\`
View change history with semantic diffs showing what changed.

\`@bot snapshots <doc>\`
Show storage statistics and snapshot compression ratios.

**Rules & Automation**
\`@bot rules <doc>\`
List all active rules for a document.

\`@bot rule:add <doc> <action> [target]\`
Create a new rule to trigger actions on changes.

Supported actions:
- \`notify <chat_id>\` - Send notification
- \`webhook <url>\` - Call external webhook
- \`task\` - Create task automatically
- \`aggregate\` - Batch hourly summaries

**Examples**
\`@bot rule:add doccnXXXX notify oc_groupYYYY\`
Notify a specific group on any change.

\`@bot rule:add shtcnXXXX webhook https://example.com/webhook\`
Call webhook on sheet changes.

\`@bot rules:status\`
Show overall rules and automation status.

📚 **How It Works**
1. **Watch** - Start monitoring with \`@bot watch\`
2. **Detect** - Bot polls every 30 seconds
3. **Snapshot** - Store compressed document snapshots
4. **Diff** - Show what changed between versions
5. **Rules** - Automatically trigger actions on changes
6. **Report** - Get notifications and summaries

💡 **Pro Tips**
- Use rules to automate workflows
- Snapshots stored for 90 days (auto-archived)
- Compression ~5-10x saves storage
- Rules never block polling
- Diffs show block-level and line-level changes`;

  try {
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "🚀 Advanced Features",
      initialContent: helpText,
    });
  } catch (error) {
    console.error("Error handling advanced help:", error);
  }
}

/**
 * Check if text is an enhanced command
 */
export function isEnhancedCommand(text: string): boolean {
  return (
    /^(?:@?bot\s+)?history\s+/i.test(text) ||
    /^(?:@?bot\s+)?snapshots\s+/i.test(text) ||
    /^(?:@?bot\s+)?rules?\s+/i.test(text) ||
    /^(?:@?bot\s+)?rule:add\s+/i.test(text) ||
    /^(?:@?bot\s+)?rules:status/i.test(text) ||
    /^(?:@?bot\s+)?tracking:advanced/i.test(text)
  );
}

/**
 * Route enhanced commands
 */
export async function handleEnhancedCommand(args: {
  message: string;
  chatId: string;
  userId: string;
  botUserId: string;
}): Promise<boolean> {
  const { message, chatId, userId, botUserId } = args;

  let text = message;
  try {
    // Parse message content if needed
    const { parseMessageContent } = await import("./feishu-utils");
    text = parseMessageContent(message);
  } catch {
    text = message;
  }

  // Remove bot mention
  text = text
    .replace(new RegExp(`<at user_id="${botUserId}">.*?</at>`, "g"), "")
    .trim();

  // Route to handlers
  if (/^(?:@?bot\s+)?history\s+/i.test(text)) {
    await handleHistoryCommand(text, chatId, userId);
    return true;
  }

  if (/^(?:@?bot\s+)?snapshots\s+/i.test(text)) {
    await handleSnapshotsCommand(text, chatId, userId);
    return true;
  }

  if (
    /^(?:@?bot\s+)?rules?\s+/i.test(text) &&
    !/^(?:@?bot\s+)?rules?:/.test(text)
  ) {
    await handleRulesCommand(text, chatId, userId);
    return true;
  }

  if (/^(?:@?bot\s+)?rule:add\s+/i.test(text)) {
    await handleRuleAddCommand(text, chatId, userId);
    return true;
  }

  if (/^(?:@?bot\s+)?rules:status/i.test(text)) {
    await handleRulesStatusCommand(chatId, userId);
    return true;
  }

  if (/^(?:@?bot\s+)?tracking:advanced/i.test(text)) {
    await handleAdvancedHelpCommand(chatId);
    return true;
  }

  return false;
}
