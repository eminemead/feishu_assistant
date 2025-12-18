import {
  startTrackingDoc,
  stopTrackingDoc,
  getTrackedDocs,
  getPollingMetrics,
  getPollingHealth,
} from "./doc-poller";
import {
  getDocMetadata,
  isValidDocToken,
  isValidDocType,
  formatDocChange,
} from "./doc-tracker";
import { getPersistence, setPersistenceUserId } from "./doc-persistence";
import {
  createAndSendStreamingCard,
  parseMessageContent,
} from "./feishu-utils";
import {
  isEnhancedCommand,
  handleEnhancedCommand,
} from "./doc-commands-enhanced";
import { runDocumentTrackingWorkflow } from "./workflows/document-tracking-workflow";
import {
  registerDocWebhook,
  deregisterDocWebhook,
  webhookStorage,
} from "./doc-webhook";

/**
 * Parse Feishu URLs and extract document tokens
 * Supports:
 * - https://feishu.cn/docs/doccnXXXXXXX
 * - https://feishu.cn/sheets/shtcnXXXXXXX
 * - Direct token: doccnXXXXXXX
 */
function extractDocTokenFromUrl(input: string): {
  docToken: string;
  docType: string;
} | null {
  // Direct token format (e.g., doccnXXXXX, shtcnXXXXX)
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

  // URL format (e.g., https://feishu.cn/docs/doccnXXXX or https://nio.feishu.cn/docx/XXX)
  const urlMatch = input.match(
    /https?:\/\/(?:\w+\.)?feishu\.cn\/(docs|sheets|bitable|docx)\/([a-zA-Z0-9]+)/
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
 * Parse watch command: "@bot watch <doc_url_or_token> [in:<group>]"
 */
function parseWatchCommand(
  text: string
): { docToken?: string; docType?: string; groupId?: string } {
  // Remove watch command (mention already removed)
  let remaining = text.replace(/^watch\s+/i, "").trim();

  // Extract "in:<group_id>" if present
  let groupId: string | undefined;
  const groupMatch = remaining.match(/in:([a-zA-Z0-9_]+)/);
  if (groupMatch) {
    groupId = groupMatch[1];
    remaining = remaining.replace(groupMatch[0], "").trim();
  }

  // Extract document token/URL
  const parsed = extractDocTokenFromUrl(remaining);

  return {
    docToken: parsed?.docToken,
    docType: parsed?.docType,
    groupId,
  };
}

/**
 * Main command handler for document tracking
 * Processes: @bot watch, @bot check, @bot unwatch, @bot watched, @bot tracking:*
 */
export async function handleDocumentCommand(args: {
  message: string;
  chatId: string;
  userId: string;
  botUserId: string;
}): Promise<boolean> {
  const { message, chatId, userId, botUserId } = args;

  // Set user context for persistence
  setPersistenceUserId(userId);

  // Parse message content if it's JSON
  let text = message;
  try {
    text = parseMessageContent(message);
  } catch {
    text = message;
  }

  text = text.replace(new RegExp(`<at user_id="${botUserId}">.*?</at>`, "g"), "").trim();

  // Check for Phase 2 enhanced commands first
  if (isEnhancedCommand(text)) {
    return await handleEnhancedCommand({ message: text, chatId, userId, botUserId });
  }

  // Command: watch <doc> (mention already removed)
  if (/^watch\s+/i.test(text)) {
    console.log(`[DocCommand] Detected watch command, executing handler for: "${text.substring(0, 80)}..."`);
    try {
      await handleWatchCommand(text, chatId, userId);
      console.log(`[DocCommand] Watch handler completed successfully`);
      return true;
    } catch (err) {
      console.error(`[DocCommand] Watch handler threw error:`, err);
      throw err; // Re-throw so it bubbles up
    }
  }

  // Command: check <doc>
  if (/^check\s+/i.test(text)) {
    await handleCheckCommand(text, chatId, userId);
    return true;
  }

  // Command: unwatch <doc>
  if (/^unwatch\s+/i.test(text)) {
    await handleUnwatchCommand(text, chatId, userId);
    return true;
  }

  // Command: watched [group:<name>]
  if (/^watched\s*/i.test(text)) {
    await handleWatchedCommand(text, chatId, userId);
    return true;
  }

  // Command: tracking:status
  if (/^tracking:status/i.test(text)) {
    await handleTrackingStatusCommand(chatId);
    return true;
  }

  // Command: tracking:help
  if (/^tracking:help/i.test(text)) {
    await handleTrackingHelpCommand(chatId);
    return true;
  }

  return false; // Not a tracked command
}

/**
 * Handle: @bot watch <doc_url_or_token>
 * Start monitoring a document
 */
async function handleWatchCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    const parsed = parseWatchCommand(text);

    if (!parsed.docToken) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Document",
        initialContent:
          "I couldn't parse the document. Please provide:\n- A Feishu document URL, or\n- A document token (e.g., doccnXXXXX)",
      });
      return;
    }

    if (!isValidDocToken(parsed.docToken)) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Invalid Token Format",
        initialContent: `The token "${parsed.docToken}" doesn't look valid. Feishu tokens are typically 20+ alphanumeric characters.`,
      });
      return;
    }

    // Fetch document metadata to verify it exists
    const metadata = await getDocMetadata(parsed.docToken, parsed.docType);

    if (!metadata) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Document Not Found",
        initialContent: `Could not access document: ${parsed.docToken}\n\nThis could mean:\n- The token is incorrect\n- The document was deleted\n- You don't have permission to access it`,
      });
      return;
    }

    const docType = parsed.docType || "doc";
    const notifyChat = parsed.groupId || chatId;

    // Register webhook for real-time change notifications
    try {
      const registered = await registerDocWebhook(
        parsed.docToken,
        docType,
        notifyChat
      );

      if (!registered) {
        throw new Error("Failed to register webhook with Feishu");
      }

      // Store subscription metadata for future reference
      await webhookStorage.save({
        docToken: parsed.docToken,
        docType: docType as any,
        chatIdToNotify: notifyChat,
        subscribedAt: Date.now(),
      });

      console.log(`✅ [Watch] Webhook registered for ${parsed.docToken}`);
    } catch (webhookError) {
      console.error("Failed to register webhook:", webhookError);
      // Fallback to polling if webhook registration fails
      console.log(`⚠️ [Watch] Falling back to polling for ${parsed.docToken}`);
      startTrackingDoc(parsed.docToken, docType, notifyChat);
    }

    // Store in persistence for historical tracking
    const persistence = getPersistence();
    await persistence.startTracking(
      parsed.docToken,
      docType,
      notifyChat,
      metadata,
      `Tracking started by user ${userId} via webhook`
    );

    // Send confirmation
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "👀 Now Monitoring Document",
      initialContent: `**Document**: ${metadata.title}
**Token**: ${metadata.docToken}
**Type**: ${metadata.docType}
**Owner**: ${metadata.ownerId}

Webhook registered! You'll get notified in real-time whenever changes are detected.`,
    });

    console.log(
      `✅ [Commands] User ${userId} started watching ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling watch command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to start tracking: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot check <doc_url_or_token>
 * Show current status of a document
 */
async function handleCheckCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    // Extract doc token
    const match = text.match(/check\s+(.+?)(?:\s+|$)/i);
    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent:
          "Usage: `@bot check <doc_url_or_token>`\n\nExample: `@bot check doccnXXXXX`",
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

    // Fetch metadata
    const metadata = await getDocMetadata(parsed.docToken, parsed.docType);

    if (!metadata) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Document Not Found",
        initialContent: `Could not access: ${parsed.docToken}`,
      });
      return;
    }

    // Run workflow once to detect/persist/notify via Mastra workflow path
    let workflowLine = "";
    try {
      const workflowResult = await runDocumentTrackingWorkflow({
        docToken: parsed.docToken,
        docType: parsed.docType || "doc",
        chatId,
        userId,
      });
      workflowLine = `\n\n**Workflow**: changeDetected=${workflowResult.changeDetected} debounced=${workflowResult.debounced} notified=${workflowResult.notified}`;
    } catch (err) {
      workflowLine = `\n\n**Workflow**: failed (${err instanceof Error ? err.message : String(err)})`;
    }

    // Get tracking state if being tracked
    const persistence = getPersistence();
    const tracked = await persistence.getTrackedDoc(parsed.docToken);

    // Get change history
    let historyContent = "";
    if (tracked) {
      const history = await persistence.getChangeHistory(parsed.docToken, 5);
      if (history.length > 0) {
        historyContent = "\n\n**Recent Changes:**\n";
        for (const change of history) {
          const time = change.changeDetectedAt.toLocaleString();
          historyContent += `- ${time}: ${change.newModifiedUser} (${change.changeType})\n`;
        }
      }
    }

    // Format response
    const modTime = new Date(
      metadata.lastModifiedTime * 1000
    ).toLocaleString();

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📄 Document Status",
      initialContent: `**Document**: ${metadata.title}
**Owner**: ${metadata.ownerId}
**Last Modified**: ${modTime}
**Last Modified By**: ${metadata.lastModifiedUser}
**Type**: ${metadata.docType}
**Tracking**: ${tracked ? "✅ YES" : "⊘ NO"}${workflowLine}${historyContent}`,
    });

    console.log(
      `✅ [Commands] User ${userId} checked status of ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling check command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to check document: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot unwatch <doc_url_or_token>
 * Stop monitoring a document
 */
async function handleUnwatchCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    const match = text.match(/unwatch\s+(.+?)(?:\s+|$)/i);
    if (!match) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "❌ Usage Error",
        initialContent:
          "Usage: `@bot unwatch <doc_url_or_token>`\n\nExample: `@bot unwatch doccnXXXXX`",
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

    const docType = parsed.docType || "doc";

    // Deregister webhook first
    try {
      const deregistered = await deregisterDocWebhook(
        parsed.docToken,
        docType
      );
      if (deregistered) {
        await webhookStorage.delete(parsed.docToken);
        console.log(`✅ [Unwatch] Webhook deregistered for ${parsed.docToken}`);
      }
    } catch (webhookError) {
      console.error("Failed to deregister webhook:", webhookError);
    }

    // Stop polling as fallback
    stopTrackingDoc(parsed.docToken);

    // Update persistence
    const persistence = getPersistence();
    const tracked = await persistence.getTrackedDoc(parsed.docToken);
    if (tracked) {
      await persistence.stopTracking(parsed.docToken);
    }

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "⏹️ Stopped Tracking",
      initialContent: `No longer monitoring: ${parsed.docToken}\n\nWebhook deregistered.`,
    });

    console.log(
      `✅ [Commands] User ${userId} stopped watching ${parsed.docToken}`
    );
  } catch (error) {
    console.error("Error handling unwatch command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to stop tracking: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot watched
 * List all documents being tracked in this group
 */
async function handleWatchedCommand(
  text: string,
  chatId: string,
  userId: string
): Promise<void> {
  try {
    const persistence = getPersistence();
    const tracked = await persistence.getTrackedDocs(true);

    // Filter to documents notifying this chat
    const forThisChat = tracked.filter((t) => t.chatIdToNotify === chatId);

    if (forThisChat.length === 0) {
      await createAndSendStreamingCard(chatId, "chat_id", {
        title: "📭 Not Tracking Any Documents",
        initialContent: `This group has no tracked documents.\n\nStart tracking with: \`@bot watch <doc_url>\``,
      });
      return;
    }

    // Build list
    let content = `**Tracking ${forThisChat.length} document(s)**:\n\n`;
    for (const doc of forThisChat) {
      const modTime = new Date(doc.lastKnownTime * 1000).toLocaleString();
      content += `📄 **${doc.title || doc.docToken}**\n`;
      content += `   Type: ${doc.docType} | Last change: ${modTime}\n`;
      content += `   Notification status: ${doc.lastKnownUser}\n\n`;
    }

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📋 Tracked Documents",
      initialContent: content,
    });

    console.log(
      `✅ [Commands] User ${userId} listed tracked documents for group`
    );
  } catch (error) {
    console.error("Error handling watched command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to list documents: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot tracking:status
 * Show poller health and metrics
 */
async function handleTrackingStatusCommand(chatId: string): Promise<void> {
  try {
    const metrics = getPollingMetrics();
    const health = getPollingHealth();

    const statusEmoji =
      health.status === "healthy"
        ? "✅"
        : health.status === "degraded"
          ? "⚠️"
          : "❌";

    const content = `${statusEmoji} **Polling System Status**: ${health.status}
${health.reason || ""}

📊 **Metrics**:
- Documents tracked: ${metrics.docsTracked}
- Success rate: ${(metrics.successRate * 100).toFixed(1)}%
- Notifications sent (1h): ${metrics.notificationsInLastHour}
- Errors (1h): ${metrics.errorsInLastHour}
- Avg poll duration: ${metrics.lastPollDurationMs}ms`;

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📈 Tracking System Status",
      initialContent: content,
    });
  } catch (error) {
    console.error("Error handling tracking:status command:", error);
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❌ Error",
      initialContent: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Handle: @bot tracking:help
 * Show help for tracking commands
 */
async function handleTrackingHelpCommand(chatId: string): Promise<void> {
  const helpText = `🤖 **Document Tracking Commands**

**Start Monitoring**
\`@bot watch <doc_url_or_token>\`
Start tracking a Feishu document for changes.

Examples:
- \`@bot watch doccnXXXXX\`
- \`@bot watch https://feishu.cn/docs/doccnXXXXX\`

**Check Status**
\`@bot check <doc_url_or_token>\`
Show current status of a document (who modified, when).

**Stop Monitoring**
\`@bot unwatch <doc_url_or_token>\`
Stop tracking a document and remove notifications.

**List Tracked**
\`@bot watched\`
Show all documents being tracked in this group.

**System Status**
\`@bot tracking:status\`
Show poller health and metrics.

**Advanced Features (Phase 2)**
\`@bot history <doc>\` - View change history with diffs
\`@bot snapshots <doc>\` - Show snapshot statistics
\`@bot rules <doc>\` - List rules for document
\`@bot rule:add <doc> <action> [target]\` - Create rule
\`@bot tracking:advanced\` - Advanced features help

**Help**
\`@bot tracking:help\`
Show this help message.

📝 **How It Works**
1. Use \`@bot watch\` to start monitoring a document
2. The bot polls the document every 30 seconds
3. When changes are detected, you get notified in this group
4. Use \`@bot check\` to manually check current status
5. Use \`@bot unwatch\` to stop monitoring

🚀 **Phase 2 Features**
- **Snapshots**: Automatic document versioning with compression
- **Diffs**: See exactly what changed between versions
- **Rules**: Automate actions on detected changes
- **History**: Query change history with semantic diffs

Use \`@bot tracking:advanced\` for more information.`;

  try {
    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "❓ Tracking Help",
      initialContent: helpText,
    });
  } catch (error) {
    console.error("Error handling help command:", error);
  }
}
