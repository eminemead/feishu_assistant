/**
 * Document storage in Supabase
 * 
 * Stores:
 * - Document metadata (token, title, type, owner, timestamps)
 * - Document snapshots (content when changes detected)
 * - Webhook subscriptions tracking
 * - Change events log
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

export interface DocumentSnapshot {
  doc_token: string;
  doc_type: string;
  content: string;
  content_hash: string;
  version?: number;
  fetched_at: string;
  is_latest?: boolean;
}

export interface DocumentMetadata {
  doc_token: string;
  title: string;
  doc_type: string;
  owner_id: string;
  created_at: string;
  last_modified_user?: string;
  last_modified_at?: string;
}

export interface ChangeEvent {
  doc_token: string;
  change_type: string;
  changed_by: string;
  changed_at: string;
  snapshot_id?: string;
}

/**
 * Store document metadata
 */
export async function storeDocumentMetadata(meta: DocumentMetadata): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("documents")
      .upsert(
        {
          doc_token: meta.doc_token,
          title: meta.title,
          doc_type: meta.doc_type,
          owner_id: meta.owner_id,
          created_at: meta.created_at,
          last_modified_user: meta.last_modified_user,
          last_modified_at: meta.last_modified_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "doc_token" }
      );

    if (error) {
      console.error("❌ Failed to store document metadata:", error);
      return false;
    }

    console.log(`✅ Stored metadata for ${meta.doc_token}`);
    return true;
  } catch (error) {
    console.error("❌ Error storing metadata:", error);
    return false;
  }
}

/**
 * Store document content snapshot
 */
export async function storeDocumentSnapshot(snapshot: DocumentSnapshot): Promise<boolean> {
  try {
    // First mark other versions as not latest
    await supabase
      .from("doc_snapshots")
      .update({ is_latest: false })
      .eq("doc_token", snapshot.doc_token);

    // Then insert new snapshot
    const { error } = await supabase
      .from("doc_snapshots")
      .insert({
        doc_token: snapshot.doc_token,
        doc_type: snapshot.doc_type,
        content: snapshot.content,
        content_hash: snapshot.content_hash || "",
        version: snapshot.version || 1,
        fetched_at: snapshot.fetched_at,
        is_latest: true,
      });

    if (error) {
      console.error("❌ Failed to store snapshot:", error);
      return false;
    }

    console.log(`✅ Stored snapshot for ${snapshot.doc_token}`);
    return true;
  } catch (error) {
    console.error("❌ Error storing snapshot:", error);
    return false;
  }
}

/**
 * Log change event
 */
export async function logChangeEvent(event: ChangeEvent): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("doc_change_events")
      .insert({
        doc_token: event.doc_token,
        change_type: event.change_type,
        changed_by: event.changed_by,
        changed_at: event.changed_at,
        snapshot_id: event.snapshot_id,
        logged_at: new Date().toISOString(),
      });

    if (error) {
      console.error("❌ Failed to log change event:", error);
      return false;
    }

    console.log(`✅ Logged change event for ${event.doc_token}`);
    return true;
  } catch (error) {
    console.error("❌ Error logging change event:", error);
    return false;
  }
}

/**
 * Get latest snapshot for document
 */
export async function getLatestSnapshot(docToken: string): Promise<DocumentSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from("doc_snapshots")
      .select("*")
      .eq("doc_token", docToken)
      .eq("is_latest", true)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      doc_token: data.doc_token,
      doc_type: data.doc_type,
      content: data.content,
      content_hash: data.content_hash,
      version: data.version,
      fetched_at: data.fetched_at,
      is_latest: data.is_latest,
    };
  } catch (error) {
    console.error("❌ Error fetching latest snapshot:", error);
    return null;
  }
}

/**
 * Get document metadata
 */
export async function getDocumentMetadata(docToken: string): Promise<DocumentMetadata | null> {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("doc_token", docToken)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      doc_token: data.doc_token,
      title: data.title,
      doc_type: data.doc_type,
      owner_id: data.owner_id,
      created_at: data.created_at,
      last_modified_user: data.last_modified_user,
      last_modified_at: data.last_modified_at,
    };
  } catch (error) {
    console.error("❌ Error fetching document metadata:", error);
    return null;
  }
}

/**
 * Get recent change events for document
 */
export async function getRecentChanges(
  docToken: string,
  limit: number = 10
): Promise<ChangeEvent[]> {
  try {
    const { data, error } = await supabase
      .from("doc_change_events")
      .select("*")
      .eq("doc_token", docToken)
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((event: any) => ({
      doc_token: event.doc_token,
      change_type: event.change_type,
      changed_by: event.changed_by,
      changed_at: event.changed_at,
      snapshot_id: event.snapshot_id,
    }));
  } catch (error) {
    console.error("❌ Error fetching recent changes:", error);
    return [];
  }
}
