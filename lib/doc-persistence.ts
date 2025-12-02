import { createClient } from "@supabase/supabase-js";
import { TrackedDoc, DocMetadata } from "./doc-tracker";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Tracked document with persistence metadata
 */
export interface PersistedTrackedDoc extends TrackedDoc {
  id: string; // Database ID
  userId: string; // Feishu user ID
  title?: string;
  ownerId?: string;
  isActive: boolean;
  startedTrackingAt: Date;
  lastNotificationSentAt?: Date;
  createdByUserId: string; // Who initiated tracking
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Change record in audit trail
 */
export interface DocumentChange {
  id: string;
  userId: string;
  docToken: string;
  previousModifiedUser?: string;
  newModifiedUser: string;
  previousModifiedTime?: number;
  newModifiedTime: number;
  changeType: "time_updated" | "user_changed" | "new_document";
  changeDetectedAt: Date;
  debounced: boolean;
  notificationSent: boolean;
  notificationSentAt?: Date;
  notificationMessageId?: string;
  errorMessage?: string;
  metadata?: any;
  createdAt: Date;
}

/**
 * Document Persistence Service
 *
 * Handles persistent storage of tracked documents and change audit trail
 * in Supabase PostgreSQL database.
 *
 * Features:
 * - Save/load tracked documents
 * - Record change history for audit trail
 * - Query tracking configuration
 * - Multi-instance safe (database-backed)
 * - Automatic RLS enforcement per user
 */
class DocumentPersistence {
  private userId: string | null = null;

  /**
   * Set the current user ID for RLS filtering
   * In production, this comes from auth context
   */
  setUserId(userId: string): void {
    this.userId = userId;
    console.log(`✅ [DocPersistence] User ID set to ${userId}`);
  }

  /**
   * Get the current user ID
   */
  getUserId(): string {
    if (!this.userId) {
      throw new Error(
        "User ID not set. Call setUserId() before persistence operations."
      );
    }
    return this.userId;
  }

  /**
   * Start tracking a document (insert into database)
   */
  async startTracking(
    docToken: string,
    docType: string,
    chatIdToNotify: string,
    metadata?: DocMetadata,
    notes?: string
  ): Promise<PersistedTrackedDoc> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_tracking")
        .insert({
          user_id: userId,
          doc_token: docToken,
          doc_type: docType,
          chat_id_to_notify: chatIdToNotify,
          title: metadata?.title,
          owner_id: metadata?.ownerId,
          is_active: true,
          last_modified_user: metadata?.lastModifiedUser,
          last_modified_time: metadata?.lastModifiedTime,
          created_by_user_id: userId, // In production, use actual requester
          notes,
        })
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to insert tracking record: ${error.message}`
        );
      }

      console.log(
        `✅ [DocPersistence] Started tracking ${docToken} → ${chatIdToNotify}`
      );

      return this.mapDbRowToPersistedTrackedDoc(data);
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to start tracking ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Stop tracking a document
   */
  async stopTracking(docToken: string): Promise<void> {
    const userId = this.getUserId();

    try {
      const { error } = await supabase
        .from("document_tracking")
        .update({ is_active: false })
        .match({ user_id: userId, doc_token: docToken });

      if (error) {
        throw new Error(
          `Failed to stop tracking: ${error.message}`
        );
      }

      console.log(`✅ [DocPersistence] Stopped tracking ${docToken}`);
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to stop tracking ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update tracked document state after polling
   */
  async updateTrackedDocState(
    docToken: string,
    update: {
      lastModifiedUser?: string;
      lastModifiedTime?: number;
      lastNotificationSentAt?: Date;
    }
  ): Promise<PersistedTrackedDoc> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_tracking")
        .update({
          last_modified_user: update.lastModifiedUser,
          last_modified_time: update.lastModifiedTime,
          last_notification_sent_at: update.lastNotificationSentAt?.toISOString(),
        })
        .match({ user_id: userId, doc_token: docToken })
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to update tracking state: ${error.message}`
        );
      }

      console.log(
        `✅ [DocPersistence] Updated state for ${docToken}`
      );

      return this.mapDbRowToPersistedTrackedDoc(data);
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to update state for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all tracked documents for current user
   */
  async getTrackedDocs(activeOnly: boolean = true): Promise<PersistedTrackedDoc[]> {
    const userId = this.getUserId();

    try {
      let query = supabase
        .from("document_tracking")
        .select("*")
        .eq("user_id", userId);

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Failed to fetch tracked documents: ${error.message}`
        );
      }

      console.log(
        `✅ [DocPersistence] Retrieved ${data?.length || 0} tracked documents`
      );

      return (data || []).map((row) => this.mapDbRowToPersistedTrackedDoc(row));
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to fetch tracked documents:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get single tracked document by token
   */
  async getTrackedDoc(docToken: string): Promise<PersistedTrackedDoc | null> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_tracking")
        .select("*")
        .match({ user_id: userId, doc_token: docToken })
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is expected
        throw new Error(
          `Failed to fetch tracked document: ${error.message}`
        );
      }

      if (!data) {
        return null;
      }

      return this.mapDbRowToPersistedTrackedDoc(data);
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to fetch tracked document ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Record a detected change in audit trail
   */
  async recordChange(
    docToken: string,
    change: {
      previousModifiedUser?: string;
      newModifiedUser: string;
      previousModifiedTime?: number;
      newModifiedTime: number;
      changeType: "time_updated" | "user_changed" | "new_document";
      debounced: boolean;
      notificationSent: boolean;
      notificationMessageId?: string;
      errorMessage?: string;
      metadata?: any;
    }
  ): Promise<DocumentChange> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_changes")
        .insert({
          user_id: userId,
          doc_token: docToken,
          previous_modified_user: change.previousModifiedUser,
          new_modified_user: change.newModifiedUser,
          previous_modified_time: change.previousModifiedTime,
          new_modified_time: change.newModifiedTime,
          change_type: change.changeType,
          debounced: change.debounced,
          notification_sent: change.notificationSent,
          notification_message_id: change.notificationMessageId,
          error_message: change.errorMessage,
          metadata: change.metadata,
        })
        .select()
        .single();

      if (error) {
        throw new Error(
          `Failed to record change: ${error.message}`
        );
      }

      console.log(
        `✅ [DocPersistence] Recorded ${change.changeType} change for ${docToken}`
      );

      return this.mapDbRowToDocumentChange(data);
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to record change for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get change history for a document
   */
  async getChangeHistory(
    docToken: string,
    limit: number = 50
  ): Promise<DocumentChange[]> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_changes")
        .select("*")
        .match({ user_id: userId, doc_token: docToken })
        .order("change_detected_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(
          `Failed to fetch change history: ${error.message}`
        );
      }

      console.log(
        `✅ [DocPersistence] Retrieved ${data?.length || 0} changes for ${docToken}`
      );

      return (data || []).map((row) => this.mapDbRowToDocumentChange(row));
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to fetch change history for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get change statistics
   */
  async getChangeStats(docToken: string): Promise<{
    totalChanges: number;
    notifiedChanges: number;
    debouncedChanges: number;
    uniqueModifiers: string[];
  }> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_changes")
        .select("*")
        .match({ user_id: userId, doc_token: docToken });

      if (error) {
        throw new Error(
          `Failed to fetch change stats: ${error.message}`
        );
      }

      const changes = data || [];
      const uniqueModifiers = new Set(
        changes.map((c: any) => c.new_modified_user)
      );

      return {
        totalChanges: changes.length,
        notifiedChanges: changes.filter((c: any) => c.notification_sent).length,
        debouncedChanges: changes.filter((c: any) => c.debounced).length,
        uniqueModifiers: Array.from(uniqueModifiers),
      };
    } catch (error) {
      console.error(
        `❌ [DocPersistence] Failed to fetch change stats for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Health check - verify database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await supabase.from("document_tracking").select("COUNT(*)").limit(1);
      if (error) {
        console.error(`❌ [DocPersistence] Health check failed:`, error);
        return false;
      }
      console.log(`✅ [DocPersistence] Health check passed`);
      return true;
    } catch (error) {
      console.error(`❌ [DocPersistence] Health check error:`, error);
      return false;
    }
  }

  // Helper methods

  private mapDbRowToPersistedTrackedDoc(row: any): PersistedTrackedDoc {
    return {
      id: row.id,
      docToken: row.doc_token,
      docType: row.doc_type,
      chatIdToNotify: row.chat_id_to_notify,
      lastKnownUser: row.last_modified_user || "",
      lastKnownTime: row.last_modified_time || 0,
      lastNotificationTime: row.last_notification_sent_at
        ? new Date(row.last_notification_sent_at).getTime()
        : 0,
      userId: row.user_id,
      title: row.title,
      ownerId: row.owner_id,
      isActive: row.is_active,
      startedTrackingAt: new Date(row.started_tracking_at),
      lastNotificationSentAt: row.last_notification_sent_at
        ? new Date(row.last_notification_sent_at)
        : undefined,
      createdByUserId: row.created_by_user_id,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapDbRowToDocumentChange(row: any): DocumentChange {
    return {
      id: row.id,
      userId: row.user_id,
      docToken: row.doc_token,
      previousModifiedUser: row.previous_modified_user,
      newModifiedUser: row.new_modified_user,
      previousModifiedTime: row.previous_modified_time,
      newModifiedTime: row.new_modified_time,
      changeType: row.change_type,
      changeDetectedAt: new Date(row.change_detected_at),
      debounced: row.debounced,
      notificationSent: row.notification_sent,
      notificationSentAt: row.notification_sent_at
        ? new Date(row.notification_sent_at)
        : undefined,
      notificationMessageId: row.notification_message_id,
      errorMessage: row.error_message,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    };
  }
}

// Singleton instance
let persistence: DocumentPersistence | null = null;

/**
 * Get persistence service instance
 */
export function getPersistence(): DocumentPersistence {
  if (!persistence) {
    persistence = new DocumentPersistence();
  }
  return persistence;
}

/**
 * Set user ID for RLS-based operations
 */
export function setPersistenceUserId(userId: string): void {
  getPersistence().setUserId(userId);
}
