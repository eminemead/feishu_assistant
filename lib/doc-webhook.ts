/**
 * Webhook-based document change tracking
 * 
 * Replaces polling with event-driven approach using Feishu webhooks
 * 
 * ARCHITECTURE:
 * 1. User calls: @bot watch <doc>
 * 2. System registers webhook for that doc (docs:event:subscribe)
 * 3. Feishu pushes change events to /webhook/docs/change
 * 4. Handler detects changes and sends notifications
 * 5. User calls: @bot unwatch <doc>
 * 6. System deregisters webhook
 * 
 * BENEFITS:
 * - Real-time (no polling delay)
 * - Cost efficient (only on changes, not every 30s)
 * - No persistent connections (unlike polling)
 * - Scales to 1000+ docs
 */

import { client } from "./feishu-utils";

/**
 * Normalize document type to Feishu API file_type parameter
 * 
 * Feishu /subscribe endpoint only accepts specific file types:
 * - "docx" for new online documents (Doc)
 * - "doc" for legacy documents
 * - "sheet" for sheets
 * - "bitable" for tables
 * 
 * @param docType Type from document metadata or URL
 * @returns Normalized type for Feishu API
 */
export function normalizeFileType(docType: string): string {
  const normalized = docType.toLowerCase().trim();
  
  // Map common variations to valid API types
  if (normalized === "document" || normalized === "documents") return "docx";
  if (normalized === "docx" || normalized === "doc") return normalized;
  if (normalized === "sheet" || normalized === "sheets") return "sheet";
  if (normalized === "bitable" || normalized === "table" || normalized === "database") return "bitable";
  if (normalized === "file" || normalized === "files") return "file";
  
  // Default to docx (most common case)
  return "docx";
}

/**
 * Webhook subscription tracking for a document
 * (Used locally to track which chats are subscribed to which docs)
 */
export interface DocWebhookSubscription {
  docToken: string;
  docType: "doc" | "docx" | "sheet" | "bitable" | "file";
  chatIdToNotify: string;
  subscribedAt: number;
}

/**
 * Event payload from Feishu when document changes
 */
export interface DocChangeEvent {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
  };
  event: {
    doc_token: string;
    doc_type: string;
    user_id: string;
    editor_type: "user" | "app";
    timestamp: string;
    change_type: string; // "edit", "rename", "move", etc.
    [key: string]: any;
  };
}

/**
 * Register webhook for document change events
 * 
 * Uses Feishu's drive/v1/files/:file_token/subscribe endpoint
 * which sends all document change events to /webhook/docs/change
 * 
 * Note: Must be owner/manager of the document to subscribe
 * 
 * @param docToken Document token
 * @param docType Document type (doc, docx, sheet, bitable, file)
 * @param chatId Group chat to notify on changes
 * @returns Success status
 */
export async function registerDocWebhook(
  docToken: string,
  docType: string,
  chatId: string
): Promise<boolean> {
  try {
    console.log(`📡 [DocWebhook] Registering webhook for ${docToken} (type: ${docType})...`);
    
    // Subscribe to document change events using Feishu's official API
    // Endpoint: POST /open-apis/drive/v1/files/:file_token/subscribe?file_type={type}
    // Note: Use "docx" for online documents, "doc" for legacy docs, "sheet" for sheets
    const fileType = normalizeFileType(docType);
    const resp = await client.request({
      method: "POST",
      url: `/open-apis/drive/v1/files/${docToken}/subscribe?file_type=${fileType}`,
    }) as any;

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0);
    if (!isSuccess) {
      throw new Error(`Failed to register webhook: ${JSON.stringify(resp)}`);
    }

    console.log(`✅ [DocWebhook] Registered webhook for ${docToken}`);
    
    return true;
  } catch (error) {
    console.error("❌ [DocWebhook] Failed to register:", error);
    throw error;
  }
}

/**
 * Deregister webhook for document
 * 
 * Uses Feishu's drive/v1/files/:file_token/delete_subscribe endpoint
 * 
 * @param docToken Document token
 * @param docType Document type
 */
export async function deregisterDocWebhook(docToken: string, docType: string): Promise<boolean> {
  try {
    console.log(`📡 [DocWebhook] Deregistering webhook for ${docToken}...`);
    
    const fileType = normalizeFileType(docType);
    const resp = await client.request({
      method: "POST",
      url: `/open-apis/drive/v1/files/${docToken}/delete_subscribe?file_type=${fileType}`,
    }) as any;

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0);
    if (!isSuccess) {
      throw new Error(`Failed to deregister webhook: ${JSON.stringify(resp)}`);
    }

    console.log(`✅ [DocWebhook] Deregistered webhook for ${docToken}`);
    return true;
  } catch (error) {
    console.error("❌ [DocWebhook] Failed to deregister:", error);
    throw error;
  }
}

/**
 * Handle incoming document change event from Feishu webhook
 * 
 * @param event Change event from Feishu
 * @returns Change details for notification
 */
export function handleDocChangeEvent(event: DocChangeEvent) {
  const { doc_token, doc_type, user_id, change_type, timestamp } = event.event;
  
  return {
    docToken: doc_token,
    docType: doc_type,
    modifiedBy: user_id,
    changeType: change_type,
    modifiedAt: new Date(parseInt(timestamp)).toISOString(),
    rawEvent: event,
  };
}

/**
 * Store webhook subscription in database for persistence
 * (For multi-instance support and restart recovery)
 */
export interface WebhookStorage {
  save(subscription: DocWebhookSubscription): Promise<void>;
  load(docToken: string): Promise<DocWebhookSubscription | null>;
  loadAll(): Promise<DocWebhookSubscription[]>;
  delete(docToken: string): Promise<void>;
}

/**
 * In-memory implementation (fallback)
 */
class InMemoryWebhookStorage implements WebhookStorage {
  private subscriptions = new Map<string, DocWebhookSubscription>();

  async save(sub: DocWebhookSubscription): Promise<void> {
    this.subscriptions.set(sub.docToken, sub);
  }

  async load(docToken: string): Promise<DocWebhookSubscription | null> {
    return this.subscriptions.get(docToken) || null;
  }

  async loadAll(): Promise<DocWebhookSubscription[]> {
    return Array.from(this.subscriptions.values());
  }

  async delete(docToken: string): Promise<void> {
    this.subscriptions.delete(docToken);
  }
}

/**
 * Supabase implementation for persistent webhook storage
 */
class SupabaseWebhookStorage implements WebhookStorage {
  async save(sub: DocWebhookSubscription): Promise<void> {
    try {
      // Try to get Supabase client
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_ANON_KEY || ""
      );

      await supabase.from("doc_webhooks").upsert({
        doc_token: sub.docToken,
        doc_type: sub.docType,
        chat_id_to_notify: sub.chatIdToNotify,
        subscribed_at: new Date(sub.subscribedAt),
        is_active: true,
      });
    } catch (error) {
      console.warn("Failed to save webhook to Supabase, falling back to in-memory:", error);
    }
  }

  async load(docToken: string): Promise<DocWebhookSubscription | null> {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_ANON_KEY || ""
      );

      const { data, error } = await supabase
        .from("doc_webhooks")
        .select("*")
        .eq("doc_token", docToken)
        .eq("is_active", true)
        .single();

      if (error || !data) return null;

      return {
        docToken: data.doc_token,
        docType: data.doc_type,
        chatIdToNotify: data.chat_id_to_notify,
        subscribedAt: new Date(data.subscribed_at).getTime(),
      };
    } catch (error) {
      console.warn("Failed to load webhook from Supabase:", error);
      return null;
    }
  }

  async loadAll(): Promise<DocWebhookSubscription[]> {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_ANON_KEY || ""
      );

      const { data, error } = await supabase
        .from("doc_webhooks")
        .select("*")
        .eq("is_active", true);

      if (error || !data) return [];

      return data.map((row: any) => ({
        docToken: row.doc_token,
        docType: row.doc_type,
        chatIdToNotify: row.chat_id_to_notify,
        subscribedAt: new Date(row.subscribed_at).getTime(),
      }));
    } catch (error) {
      console.warn("Failed to load webhooks from Supabase:", error);
      return [];
    }
  }

  async delete(docToken: string): Promise<void> {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_ANON_KEY || ""
      );

      await supabase
        .from("doc_webhooks")
        .update({ is_active: false })
        .eq("doc_token", docToken);
    } catch (error) {
      console.warn("Failed to delete webhook from Supabase:", error);
    }
  }
}

// Use Supabase if available, fallback to in-memory
export const webhookStorage = process.env.SUPABASE_URL
  ? new SupabaseWebhookStorage()
  : new InMemoryWebhookStorage();
