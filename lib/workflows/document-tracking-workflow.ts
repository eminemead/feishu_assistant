/**
 * Document Tracking Workflow (Mastra)
 *
 * Orchestrates end-to-end document monitoring using Mastra workflows:
 * 1) Fetch Feishu metadata
 * 2) Detect changes (debounced)
 * 3) Persist tracking + audit trail
 * 4) Notify chat with a formatted summary
 *
 * This wraps the existing doc tracking helpers into a deterministic,
 * testable workflow that can be invoked from schedulers, agents, or
 * button handlers.
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  getDocMetadata,
  formatDocChange,
  DocMetadata,
} from "../doc-tracker";
import {
  detectChange,
  ChangeDetectionResult,
} from "../change-detector";
import {
  getPersistence,
  setPersistenceUserId,
  PersistedTrackedDoc,
} from "../doc-persistence";
import { createAndSendStreamingCard } from "../feishu-utils";
import { startTrackingDoc } from "../doc-poller";

const fetchMetadataStep = createStep({
  id: "fetch-metadata",
  description: "Fetch Feishu document metadata",
  inputSchema: z.object({
    docToken: z.string().min(1, "docToken is required"),
    docType: z.string().default("doc"),
    chatId: z.string().min(1, "chatId is required"),
    userId: z.string().min(1, "userId is required"),
  }),
  outputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { docToken, docType, chatId, userId } = inputData;

    const metadata = await getDocMetadata(docToken, docType);
    if (!metadata) {
      throw new Error(
        `Failed to fetch metadata for ${docToken}. Check permissions or token.`
      );
    }

    return { metadata, docToken, docType, chatId, userId };
  },
});

const detectChangeStep = createStep({
  id: "detect-change",
  description: "Compare metadata and detect changes with debouncing",
  inputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    detection: z.custom<ChangeDetectionResult>(),
    tracked: z.custom<PersistedTrackedDoc | null>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { metadata, docToken, docType, chatId, userId } = inputData;

    // Load persisted state (if any) for proper debouncing
    setPersistenceUserId(userId);
    const persistence = getPersistence();
    const tracked = await persistence.getTrackedDoc(docToken);

    const detection = detectChange(metadata, tracked || undefined, {
      debounceWindowMs: 5000,
      enableLogging: true,
    });

    return {
      metadata,
      detection,
      tracked,
      docToken,
      docType,
      chatId,
      userId,
    };
  },
});

const persistChangeStep = createStep({
  id: "persist-change",
  description: "Persist tracking state and audit trail",
  inputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    detection: z.custom<ChangeDetectionResult>(),
    tracked: z.custom<PersistedTrackedDoc | null>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    detection: z.custom<ChangeDetectionResult>(),
    tracked: z.custom<PersistedTrackedDoc | null>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
    changeRecorded: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { metadata, detection, tracked, docToken, docType, chatId, userId } =
      inputData;

    setPersistenceUserId(userId);
    const persistence = getPersistence();

    let persistedTracked = tracked;
    let changeRecorded = false;

    // Ensure tracking exists in persistence and poller
    if (!persistedTracked) {
      startTrackingDoc(docToken, docType, chatId);
      persistedTracked = await persistence.startTracking(
        docToken,
        docType,
        chatId,
        metadata,
        `Tracking initiated via workflow by ${userId}`
      );
    }

    if (detection.hasChanged) {
      await persistence.recordChange(docToken, {
        previousModifiedUser: detection.previousUser,
        newModifiedUser: detection.currentUser,
        previousModifiedTime: detection.previousTime,
        newModifiedTime: detection.currentTime,
        changeType: detection.changeType || "time_updated",
        debounced: detection.debounced,
        notificationSent: !detection.debounced,
        metadata: {
          reason: detection.reason,
        },
      });
      changeRecorded = true;

      // Update tracked state only when we intend to notify (not debounced)
      if (!detection.debounced) {
        persistedTracked = await persistence.updateTrackedDocState(docToken, {
          lastModifiedUser: metadata.lastModifiedUser,
          lastModifiedTime: metadata.lastModifiedTime,
          lastNotificationSentAt: new Date(),
        });
      }
    }

    return {
      metadata,
      detection,
      tracked: persistedTracked,
      docToken,
      docType,
      chatId,
      userId,
      changeRecorded,
    };
  },
});

const notifyStep = createStep({
  id: "notify",
  description: "Send notification if change detected",
  inputSchema: z.object({
    metadata: z.custom<DocMetadata>(),
    detection: z.custom<ChangeDetectionResult>(),
    tracked: z.custom<PersistedTrackedDoc | null>(),
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
    changeRecorded: z.boolean(),
  }),
  outputSchema: z.object({
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
    changeDetected: z.boolean(),
    debounced: z.boolean(),
    notified: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { metadata, detection, docToken, docType, chatId, userId } =
      inputData;

    if (!detection.hasChanged) {
      return {
        docToken,
        docType,
        chatId,
        userId,
        changeDetected: false,
        debounced: false,
        notified: false,
        message: "No changes detected",
      };
    }

    if (detection.debounced) {
      return {
        docToken,
        docType,
        chatId,
        userId,
        changeDetected: true,
        debounced: true,
        notified: false,
        message: detection.reason || "Change detected but debounced",
      };
    }

    const formatted = formatDocChange(metadata);
    const reason = detection.reason ? `\n\nReason: ${detection.reason}` : "";

    await createAndSendStreamingCard(chatId, "chat_id", {
      title: "📄 Document Changed",
      initialContent: `${formatted}${reason}`,
    });

    return {
      docToken,
      docType,
      chatId,
      userId,
      changeDetected: true,
      debounced: false,
      notified: true,
      message: formatted,
    };
  },
});

/**
 * Document Tracking Workflow
 *
 * Input: doc token/type + chat/user context
 * Output: change detection status and notification result
 */
export const documentTrackingWorkflow = createWorkflow({
  id: "document-tracking",
  description:
    "Poll Feishu doc → detect change → persist → notify via Feishu card",
  inputSchema: z.object({
    docToken: z.string(),
    docType: z.string().default("doc"),
    chatId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    docToken: z.string(),
    docType: z.string(),
    chatId: z.string(),
    userId: z.string(),
    changeDetected: z.boolean(),
    debounced: z.boolean(),
    notified: z.boolean(),
    message: z.string(),
  }),
})
  .then(fetchMetadataStep)
  .then(detectChangeStep)
  .then(persistChangeStep)
  .then(notifyStep)
  .commit();

/**
 * Helper to run the workflow imperatively.
 * Can be invoked from schedulers, agents, or HTTP handlers.
 */
export async function runDocumentTrackingWorkflow(params: {
  docToken: string;
  docType?: string;
  chatId: string;
  userId: string;
}) {
  return documentTrackingWorkflow.run({
    docToken: params.docToken,
    docType: params.docType || "doc",
    chatId: params.chatId,
    userId: params.userId,
  });
}
