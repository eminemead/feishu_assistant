/**
 * Integration tests for Feishu Task → GitLab Sync
 * 
 * Tests the webhook handler and service functions for syncing
 * Feishu Tasks to GitLab Issues.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  getFeishuTaskDetails,
  createGitlabIssueFromTask,
  updateGitlabIssueFromTask,
  getGitlabIssueByTaskGuid,
  FeishuTaskDetails,
} from '../lib/services/feishu-task-service';
import {
  handleTaskUpdatedEvent,
  TaskUpdatedEvent,
} from '../lib/handlers/feishu-task-webhook-handler';

// Mock dependencies
vi.mock('../lib/feishu-utils', () => ({
  client: {
    task: {
      v2: {
        task: {
          get: vi.fn(),
          create: vi.fn(),
          patch: vi.fn(),
        },
        comment: {
          get: vi.fn(),
        },
      },
    },
    contact: {
      v3: {
        user: {
          get: vi.fn(),
        },
      },
    },
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
        })),
        in: vi.fn(() => ({ data: [], error: null })),
      })),
      upsert: vi.fn(() => ({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  })),
}));

vi.mock('child_process', () => ({
  exec: vi.fn((cmd, callback) => {
    // Mock successful glab commands
    if (cmd.includes('issue create')) {
      callback(null, { stdout: 'Created issue #123 at https://git.nevint.com/...', stderr: '' });
    } else if (cmd.includes('issue close')) {
      callback(null, { stdout: 'Closing issue #123...', stderr: '' });
    } else if (cmd.includes('issue reopen')) {
      callback(null, { stdout: 'Reopening issue #123...', stderr: '' });
    } else if (cmd.includes('issue update')) {
      callback(null, { stdout: 'Updated issue #123', stderr: '' });
    } else if (cmd.includes('issue note')) {
      callback(null, { stdout: 'Note added', stderr: '' });
    } else {
      callback(null, { stdout: '', stderr: '' });
    }
  }),
}));

describe('Feishu Task → GitLab Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeishuTaskDetails', () => {
    it('fetches task details from Feishu API', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'test-guid',
            summary: 'Test Task',
            description: 'Test description',
          },
        },
      });

      const task = await getFeishuTaskDetails('test-guid');

      expect(task).not.toBeNull();
      expect(task?.guid).toBe('test-guid');
      expect(task?.summary).toBe('Test Task');
    });

    it('returns null when task not found', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 99999,
        data: null,
      });

      const task = await getFeishuTaskDetails('nonexistent');

      expect(task).toBeNull();
    });
  });

  describe('createGitlabIssueFromTask', () => {
    it('creates GitLab issue from Feishu task', async () => {
      const mockTask: FeishuTaskDetails = {
        guid: 'task-123',
        summary: 'Test Issue',
        description: 'Test description',
        url: 'https://feishu.cn/task/123',
      };

      const result = await createGitlabIssueFromTask(mockTask);

      expect(result.success).toBe(true);
      expect(result.issueIid).toBe(123);
      expect(result.issueUrl).toContain('/issues/123');
    });

    it('includes due date when present', async () => {
      const mockTask: FeishuTaskDetails = {
        guid: 'task-456',
        summary: 'Task with due date',
        due: {
          timestamp: '1704067200', // 2024-01-01
          is_all_day: true,
        },
      };

      const result = await createGitlabIssueFromTask(mockTask);

      expect(result.success).toBe(true);
    });
  });

  describe('updateGitlabIssueFromTask', () => {
    it('updates GitLab issue title', async () => {
      const mockTask: FeishuTaskDetails = {
        guid: 'task-789',
        summary: 'Updated Title',
      };

      const result = await updateGitlabIssueFromTask(123, mockTask, ['summary']);

      expect(result.success).toBe(true);
    });

    it('closes issue when completed_at is set', async () => {
      const mockTask: FeishuTaskDetails = {
        guid: 'task-completed',
        summary: 'Completed Task',
        completed_at: '1704067200',
      };

      const result = await updateGitlabIssueFromTask(123, mockTask, ['completed_at']);

      expect(result.success).toBe(true);
    });
  });

  describe('handleTaskUpdatedEvent', () => {
    it('handles task.created event', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'new-task',
            summary: 'New Task',
          },
        },
      });

      const event: TaskUpdatedEvent = {
        schema: '2.0',
        header: { event_type: 'task.task.created_v1' },
        event: {
          task_guid: 'new-task',
          obj_type: 1,
          event_key: 'task.created',
        },
      };

      const result = await handleTaskUpdatedEvent(event);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Created GitLab issue');
    });

    it('handles task.completed event', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'complete-task',
            summary: 'Task to Complete',
          },
        },
      });

      const event: TaskUpdatedEvent = {
        schema: '2.0',
        header: { event_type: 'task.task.updated_v1' },
        event: {
          task_guid: 'complete-task',
          obj_type: 1,
          event_key: 'task.completed',
        },
      };

      const result = await handleTaskUpdatedEvent(event);

      // Will report "No linked GitLab issue" since we haven't set up the mock link
      expect(result.success).toBe(true);
    });

    it('handles task.uncompleted event', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'reopen-task',
            summary: 'Task to Reopen',
          },
        },
      });

      const event: TaskUpdatedEvent = {
        schema: '2.0',
        header: { event_type: 'task.task.updated_v1' },
        event: {
          task_guid: 'reopen-task',
          obj_type: 1,
          event_key: 'task.uncompleted',
        },
      };

      const result = await handleTaskUpdatedEvent(event);

      expect(result.success).toBe(true);
    });

    it('ignores unknown event types', async () => {
      const { client } = await import('../lib/feishu-utils');
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'unknown-event-task',
            summary: 'Task',
          },
        },
      });

      const event: TaskUpdatedEvent = {
        schema: '2.0',
        header: { event_type: 'task.task.updated_v1' },
        event: {
          task_guid: 'unknown-event-task',
          obj_type: 1,
          event_key: 'task.unknown_event',
        },
      };

      const result = await handleTaskUpdatedEvent(event);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Ignored');
    });
  });

  describe('Comment Sync', () => {
    it('handles task.comment.created event', async () => {
      const { client } = await import('../lib/feishu-utils');
      
      // Mock task fetch
      (client.task.v2.task.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          task: {
            guid: 'comment-task',
            summary: 'Task with Comment',
          },
        },
      });
      
      // Mock comment fetch
      (client.task.v2.comment.get as Mock).mockResolvedValue({
        code: 0,
        data: {
          comment: {
            content: 'This is a test comment',
            creator: { id: 'ou_test123' },
          },
        },
      });

      const event: TaskUpdatedEvent = {
        schema: '2.0',
        header: { event_type: 'task.task.comment_created_v1' },
        event: {
          task_guid: 'comment-task',
          obj_type: 1,
          event_key: 'task.comment.created',
          comment_guid: 'comment-123',
        },
      };

      const result = await handleTaskUpdatedEvent(event);

      // Will report "No linked GitLab issue" since we haven't set up the mock link
      expect(result.success).toBe(true);
    });
  });
});
