/**
 * Issue Thread Mapping Service
 * 
 * Maps Feishu threads to GitLab issues for auto-syncing replies as notes.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface IssueThreadMapping {
  id?: string;
  chatId: string;
  rootId: string;
  project: string;
  issueIid: number;
  issueUrl: string;
  createdBy: string;
  createdAt?: string;
}

export interface IssueThreadMappingRecord {
  id: string;
  chat_id: string;
  root_id: string;
  project: string;
  issue_iid: number;
  issue_url: string;
  created_by: string;
  created_at: string;
}

/**
 * Store a new issue-thread mapping after GitLab issue creation
 */
export async function storeIssueThreadMapping(mapping: Omit<IssueThreadMapping, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string }> {
  const { chatId, rootId, project, issueIid, issueUrl, createdBy } = mapping;
  
  if (!chatId || !rootId || !project || !issueIid || !issueUrl) {
    return { success: false, error: 'Missing required fields' };
  }

  try {
    const { error } = await supabase
      .from('gitlab_issue_thread_mappings')
      .upsert({
        chat_id: chatId,
        root_id: rootId,
        project,
        issue_iid: issueIid,
        issue_url: issueUrl,
        created_by: createdBy,
      }, {
        onConflict: 'chat_id,root_id'
      });

    if (error) {
      console.error('[IssueThreadMapping] Failed to store mapping:', error);
      return { success: false, error: error.message };
    }

    console.log(`[IssueThreadMapping] Stored mapping: thread ${rootId} → issue #${issueIid}`);
    return { success: true };
  } catch (err: any) {
    console.error('[IssueThreadMapping] Exception storing mapping:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get linked GitLab issue for a Feishu thread
 */
export async function getLinkedIssue(chatId: string, rootId: string): Promise<IssueThreadMapping | null> {
  if (!chatId || !rootId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('gitlab_issue_thread_mappings')
      .select('*')
      .eq('chat_id', chatId)
      .eq('root_id', rootId)
      .single();

    if (error || !data) {
      return null;
    }

    const record = data as IssueThreadMappingRecord;
    return {
      id: record.id,
      chatId: record.chat_id,
      rootId: record.root_id,
      project: record.project,
      issueIid: record.issue_iid,
      issueUrl: record.issue_url,
      createdBy: record.created_by,
      createdAt: record.created_at,
    };
  } catch (err: any) {
    console.error('[IssueThreadMapping] Exception getting linked issue:', err);
    return null;
  }
}

/**
 * Delete a thread-issue mapping (unlink)
 */
export async function unlinkThread(chatId: string, rootId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('gitlab_issue_thread_mappings')
      .delete()
      .eq('chat_id', chatId)
      .eq('root_id', rootId);

    if (error) {
      return { success: false, error: error.message };
    }

    console.log(`[IssueThreadMapping] Unlinked thread ${rootId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all threads linked to a GitLab issue
 */
export async function getThreadsForIssue(project: string, issueIid: number): Promise<IssueThreadMapping[]> {
  try {
    const { data, error } = await supabase
      .from('gitlab_issue_thread_mappings')
      .select('*')
      .eq('project', project)
      .eq('issue_iid', issueIid);

    if (error || !data) {
      return [];
    }

    return data.map((record: IssueThreadMappingRecord) => ({
      id: record.id,
      chatId: record.chat_id,
      rootId: record.root_id,
      project: record.project,
      issueIid: record.issue_iid,
      issueUrl: record.issue_url,
      createdBy: record.created_by,
      createdAt: record.created_at,
    }));
  } catch (err: any) {
    console.error('[IssueThreadMapping] Exception getting threads for issue:', err);
    return [];
  }
}
