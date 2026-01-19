/**
 * Feishu Task Workflow
 *
 * Deterministic workflow for Feishu Tasks:
 * - Create tasks
 * - List tasklists/tasks (OAuth)
 * - Complete/uncomplete tasks
 * - Optional GitLab linking
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { generateText } from "ai";
import { z } from "zod";
import { getMastraModelSingle } from "../shared/model-router";
import {
  createFeishuTask,
  updateFeishuTaskStatus,
  createGitlabIssueFromTask,
  listTaskLinks,
  saveTaskLinkExtended,
  enqueueTaskLinkJob,
  updateFeishuTaskDescription,
  type FeishuTaskDetails,
} from "../services/feishu-task-service";
import { getFeishuOpenId } from "../services/user-mapping-service";
import { baseWorkflowInputSchema } from "./types";

const DEFAULT_GITLAB_PROJECT =
  process.env.FEISHU_TASK_GITLAB_PROJECT || "dpa/dpa-mom/task";
const OPEN_ID_REGEX = /^ou_[a-z0-9]+/i;
const MAX_LIST_LIMIT = 50;
const TASK_CONFIRM_PREFIX = "__feishu_task_confirm__";
const TASK_CANCEL_PREFIX = "__feishu_task_cancel__";

const TaskIntentEnum = z.enum([
  "create_task",
  "list_tasks",
  "complete_task",
  "link_gitlab",
  "help",
]);
type TaskIntent = z.infer<typeof TaskIntentEnum>;

type TaskParams = {
  summary?: string;
  description?: string;
  dueDate?: string;
  assignees?: string[];
  assigneeOpenIds?: string[];
  taskGuid?: string;
  taskUrl?: string;
  tasklistName?: string;
  tasklistGuid?: string;
  limit?: number;
  linkGitlab?: boolean;
  gitlabProject?: string;
  completed?: boolean;
  __confirmed?: boolean;
  __cancelled?: boolean;
};

function isOpenId(value?: string): boolean {
  return !!value && OPEN_ID_REGEX.test(value);
}

function stripCodeFences(text: string): string {
  return text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
}

function extractTaskGuid(input: string): string | null {
  const patterns = [
    /task_guid=([a-zA-Z0-9-]+)/i,
    /task_guid[:=]\s*([a-zA-Z0-9-]+)/i,
    /tasks\/([a-zA-Z0-9-]{8,})/i,
    /task\/([a-zA-Z0-9-]{8,})/i,
    /\b[0-9a-f]{8}-[0-9a-f-]{27}\b/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function normalizeAssignees(raw?: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean);
  }
  if (typeof raw === "string") {
    return [raw];
  }
  return [];
}

function normalizeBoolean(value?: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

async function resolveAssigneeOpenIds(
  assignees: string[],
  userId?: string
): Promise<string[]> {
  const resolved = new Set<string>();
  for (const raw of assignees) {
    const candidate = raw.replace(/^@/, "").trim();
    if (!candidate) continue;
    if (candidate.toLowerCase() === "me" && isOpenId(userId)) {
      resolved.add(userId!);
      continue;
    }
    if (candidate === "self" && isOpenId(userId)) {
      resolved.add(userId!);
      continue;
    }
    if (isOpenId(candidate)) {
      resolved.add(candidate);
      continue;
    }
    const mapped = await getFeishuOpenId(candidate);
    if (mapped) resolved.add(mapped);
  }
  return Array.from(resolved);
}

function toUnixTimestampString(dateInput?: string): string | undefined {
  if (!dateInput) return undefined;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor(date.getTime() / 1000).toString();
}

function parseConfirmationQuery(query: string): { cancelled: boolean; payload?: TaskParams } | null {
  if (query.startsWith(TASK_CANCEL_PREFIX)) {
    return { cancelled: true };
  }

  if (!query.startsWith(`${TASK_CONFIRM_PREFIX}:`)) {
    return null;
  }

  const raw = query.slice(`${TASK_CONFIRM_PREFIX}:`.length).trim();
  if (!raw) {
    return { cancelled: false };
  }

  try {
    const parsed = JSON.parse(raw) as TaskParams | { payload?: TaskParams; data?: TaskParams };
    const payload =
      (parsed as any).payload ??
      (parsed as any).data ??
      parsed;
    return { cancelled: false, payload: payload as TaskParams };
  } catch (error) {
    console.warn("[FeishuTaskWorkflow] Failed to parse confirmation payload:", error);
    return { cancelled: false };
  }
}

function buildTaskPreview(params: TaskParams, project: string): string {
  const dueText = params.dueDate ? `\n- Due: ${params.dueDate}` : "";
  const assigneeText = params.assigneeOpenIds?.length
    ? `\n- Assignees: ${params.assigneeOpenIds.join(", ")}`
    : "";
  const descriptionText = params.description
    ? `\n- Description: ${params.description}`
    : "";
  return (
    `## Task Preview\n- Summary: ${params.summary}` +
    descriptionText +
    dueText +
    assigneeText +
    `\n- GitLab Project: ${project}\n\n` +
    "Confirm to create Feishu task + GitLab issue."
  );
}


// ----------------------------------------------------------------------------
// Step 1: Classify intent
// ----------------------------------------------------------------------------
const classifyIntentStep = createStep({
  id: "classify-intent",
  inputSchema: baseWorkflowInputSchema,
  outputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    const confirmation = parseConfirmationQuery(trimmed);
    if (confirmation) {
      return { ...inputData, intent: "create_task" as TaskIntent };
    }

    if (lower.startsWith("/tasklist") || lower.startsWith("/tasks")) {
      return { ...inputData, intent: "list_tasks" as TaskIntent };
    }
    if (lower.startsWith("/task") || lower.startsWith("/todo")) {
      return { ...inputData, intent: "create_task" as TaskIntent };
    }
    if (lower.startsWith("/done") || lower.startsWith("/complete")) {
      return { ...inputData, intent: "complete_task" as TaskIntent };
    }
    if (lower.startsWith("/taskhelp") || lower.startsWith("/help")) {
      return { ...inputData, intent: "help" as TaskIntent };
    }

    if (/(list|tasks|task list|tasklist)/i.test(lower)) {
      return { ...inputData, intent: "list_tasks" as TaskIntent };
    }
    if (/(complete|done|finish|reopen|undo)/i.test(lower)) {
      return { ...inputData, intent: "complete_task" as TaskIntent };
    }
    if (/(create|new task|todo|task)/i.test(lower)) {
      return { ...inputData, intent: "create_task" as TaskIntent };
    }
    if (/(gitlab|issue)/i.test(lower)) {
      return { ...inputData, intent: "link_gitlab" as TaskIntent };
    }

    try {
      const model = getMastraModelSingle(false);
      const prompt = `Classify the user request into ONE intent:
- create_task: create a new Feishu task
- list_tasks: list tasklists or tasks
- complete_task: complete or uncomplete a task
- link_gitlab: link task with GitLab issue
- help: show usage help

Return ONLY the intent string.

User query: ${trimmed}`;

      const { text } = await generateText({
        model,
        prompt,
        temperature: 0,
      });

      const intentRaw = text.trim().toLowerCase().replace(/[^a-z_]/g, "");
      const intent =
        intentRaw === "create_task"
          ? "create_task"
          : intentRaw === "list_tasks"
          ? "list_tasks"
          : intentRaw === "complete_task"
          ? "complete_task"
          : intentRaw === "link_gitlab"
          ? "link_gitlab"
          : "help";

      return { ...inputData, intent };
    } catch (error) {
      console.warn("[FeishuTaskWorkflow] Intent classification failed:", error);
      return { ...inputData, intent: "help" as TaskIntent };
    }
  },
});

// ----------------------------------------------------------------------------
// Step 2: Parse request
// ----------------------------------------------------------------------------
const parseRequestStep = createStep({
  id: "parse-request",
  inputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
  }),
  outputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
    params: z.record(z.unknown()),
  }),
  execute: async ({ inputData }) => {
    const { query, intent } = inputData;
    let params: TaskParams = {};

    const confirmation = parseConfirmationQuery(query.trim());
    if (confirmation) {
      if (confirmation.cancelled) {
        return {
          ...inputData,
          params: { __cancelled: true },
        };
      }
      if (confirmation.payload) {
        return {
          ...inputData,
          params: { ...confirmation.payload, __confirmed: true },
        };
      }
    }

    if (intent !== "help") {
      try {
        const model = getMastraModelSingle(false);
        const prompt = `Extract task parameters as JSON (no markdown).
Return ONLY JSON with keys:
summary, description, dueDate, assignees, taskGuid, taskUrl,
tasklistName, tasklistGuid, limit, linkGitlab, gitlabProject, completed.
Use null for unknowns. assignees must be an array of strings.

User query: ${query}`;

        const { text } = await generateText({
          model,
          prompt,
          temperature: 0,
        });

        const raw = stripCodeFences(text);
        const parsed = JSON.parse(raw) as TaskParams;
        params = { ...parsed };
      } catch (error) {
        console.warn("[FeishuTaskWorkflow] Parse failed:", error);
      }
    }

    const fallbackGuid = extractTaskGuid(query);
    if (!params.taskGuid && fallbackGuid) params.taskGuid = fallbackGuid;

    if (intent === "create_task" && !params.summary) {
      params.summary = query.trim();
    }

    params.assignees = normalizeAssignees(params.assignees);
    params.assigneeOpenIds = normalizeAssignees(params.assigneeOpenIds);
    params.linkGitlab = normalizeBoolean(params.linkGitlab);
    params.completed = normalizeBoolean(params.completed);

    if (typeof params.dueDate === "number") {
      params.dueDate = String(params.dueDate);
    }

    if (typeof params.limit === "string") {
      const num = parseInt(params.limit, 10);
      params.limit = Number.isFinite(num) ? num : undefined;
    }

    return { ...inputData, params };
  },
});

// ----------------------------------------------------------------------------
// Step 3: Auth check
// ----------------------------------------------------------------------------
const ensureAuthStep = createStep({
  id: "ensure-auth",
  inputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
    params: z.record(z.unknown()),
  }),
  outputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
    params: z.record(z.unknown()),
    authRequired: z.boolean(),
    authUrl: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    return { ...inputData, authRequired: false };
  },
});

// ----------------------------------------------------------------------------
// Step 4: Execute
// ----------------------------------------------------------------------------
const executeTaskStep = createStep({
  id: "execute-task",
  inputSchema: baseWorkflowInputSchema.extend({
    intent: TaskIntentEnum,
    params: z.record(z.unknown()),
    authRequired: z.boolean(),
    authUrl: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: TaskIntentEnum,
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { intent, params: rawParams, userId, query } = inputData;
    const params = rawParams as TaskParams;
    const effectiveIntent = intent === "link_gitlab" ? "create_task" : intent;

    if (intent === "link_gitlab") {
      params.linkGitlab = true;
    }

    if (params.__cancelled) {
      return {
        result: "🚫 Cancelled",
        intent,
      };
    }

    if (intent === "help") {
      return {
        result:
          "## Feishu Tasks Help\n" +
          "- Create task: `create a task Fix pipeline by Friday`\n" +
          "- List linked tasks: `list tasks` (optional: `for dpa/dpa-mom/task`)\n" +
          "- Complete task: `complete task <task_guid>`",
        intent,
      };
    }

    if (effectiveIntent === "list_tasks") {
      const limit = Math.min(params.limit || 20, MAX_LIST_LIMIT);
      const project = params.gitlabProject || DEFAULT_GITLAB_PROJECT;
      const feishuStatus =
        params.completed === true ? "done" : params.completed === false ? "todo" : undefined;

      const links = await listTaskLinks({
        project,
        feishuStatus,
        limit,
      });

      if (!links.length) {
        return {
          result: `No linked tasks found for ${project}.`,
          intent,
        };
      }

      const lines = links.map((link) => {
        const status = `${link.gitlab_status}/${link.feishu_status}`;
        const gitlabRef = `${link.gitlab_project}#${link.gitlab_issue_iid}`;
        const gitlabUrl = link.gitlab_issue_url
          ? ` ${link.gitlab_issue_url}`
          : "";
        const taskUrl = link.feishu_task_url ? ` ${link.feishu_task_url}` : "";
        return `- [${status}] ${gitlabRef}${gitlabUrl}${taskUrl}`;
      });

      return {
        result: `## Linked Tasks (${project})\n` + lines.join("\n"),
        intent,
      };
    }

    if (effectiveIntent === "complete_task") {
      const taskGuid =
        params.taskGuid ||
        (params.taskUrl ? extractTaskGuid(params.taskUrl) : null) ||
        extractTaskGuid(query);

      if (!taskGuid) {
        return {
          result: "Task GUID is required. Provide a task link or task_guid.",
          intent,
        };
      }

      const isUncomplete =
        /(reopen|undo|uncomplete|not done|unfinished)/i.test(query);
      const completed =
        params.completed !== undefined ? params.completed : !isUncomplete;

      const status = await updateFeishuTaskStatus(taskGuid, completed);
      if (!status.success) {
        return {
          result: `Failed to update task status: ${status.error}`,
          intent,
        };
      }

      return {
        result: completed
          ? `Task marked as completed: ${taskGuid}`
          : `Task marked as not completed: ${taskGuid}`,
        intent,
      };
    }

    if (effectiveIntent === "create_task") {
      const summary = params.summary?.trim();
      if (!summary) {
        return {
          result: "Task summary is required.",
          intent,
        };
      }

      const assignees = normalizeAssignees(params.assignees);
      let assigneeOpenIds = normalizeAssignees(params.assigneeOpenIds);
      if (!assigneeOpenIds.length) {
        assigneeOpenIds = await resolveAssigneeOpenIds(assignees, userId);
      }
      if (!assigneeOpenIds.length && isOpenId(userId)) {
        assigneeOpenIds = [userId!];
      }

      const dueTimestamp = toUnixTimestampString(params.dueDate);
      const dueDate = dueTimestamp ? params.dueDate : undefined;
      const due = dueTimestamp
        ? { timestamp: dueTimestamp, is_all_day: true }
        : undefined;
      const project = params.gitlabProject || DEFAULT_GITLAB_PROJECT;
      const baseDescription = params.description?.trim() || "";

      if (!params.__confirmed) {
        const previewParams: TaskParams = {
          summary,
          description: baseDescription || undefined,
          dueDate,
          assigneeOpenIds: assigneeOpenIds.length ? assigneeOpenIds : undefined,
          gitlabProject: project,
          __confirmed: true,
        };

        const confirmationData = JSON.stringify({
          confirmPrefix: TASK_CONFIRM_PREFIX,
          cancelPrefix: TASK_CANCEL_PREFIX,
          payload: previewParams,
        });

        return {
          result: buildTaskPreview(previewParams, project),
          intent,
          needsConfirmation: true,
          confirmationData,
        };
      }

      const createResult = await createFeishuTask({
        summary,
        description: baseDescription || undefined,
        dueDate,
        assigneeOpenIds: assigneeOpenIds.length ? assigneeOpenIds : undefined,
        creatorOpenId: isOpenId(userId) ? userId : undefined,
      });

      if (!createResult.success) {
        return {
          result: `Failed to create task: ${createResult.error}`,
          intent,
        };
      }

      const taskDetails: FeishuTaskDetails = {
        guid: createResult.taskGuid || "",
        summary,
        description: baseDescription || undefined,
        due,
        members: assigneeOpenIds.map((id) => ({
          id,
          type: "user",
          role: "assignee",
        })),
        url: createResult.taskUrl,
      };

      const gitlabResult = await createGitlabIssueFromTask(
        taskDetails,
        createResult.taskUrl,
        project
      );

      if (!gitlabResult.success || !gitlabResult.issueIid || !gitlabResult.issueUrl) {
        let queueNote = "";
        if (createResult.taskGuid) {
          const queuedId = await enqueueTaskLinkJob({
            taskGuid: createResult.taskGuid,
            taskUrl: createResult.taskUrl || undefined,
            summary,
            description: baseDescription || undefined,
            dueTimestamp: dueTimestamp || undefined,
            assigneeOpenIds: assigneeOpenIds.length ? assigneeOpenIds : undefined,
            gitlabProject: project,
            createdBy: isOpenId(userId) ? userId : undefined,
            requestedAt: new Date().toISOString(),
          });
          queueNote = queuedId
            ? `\nQueued GitLab link retry (job ${queuedId}).`
            : "\nFailed to enqueue GitLab link retry.";
        }

        return {
          result:
            `Feishu task created, but GitLab issue creation failed: ${gitlabResult.error}` +
            (createResult.taskUrl ? `\nTask: ${createResult.taskUrl}` : "") +
            "\nGitLab link pending; will sync later." +
            queueNote,
          intent,
        };
      }

      if (createResult.taskGuid) {
        await saveTaskLinkExtended({
          gitlabProject: project,
          gitlabIssueIid: gitlabResult.issueIid,
          gitlabIssueUrl: gitlabResult.issueUrl,
          feishuTaskGuid: createResult.taskGuid,
          feishuTaskUrl: createResult.taskUrl,
        });

        const linkedDescription = baseDescription
          ? `${baseDescription}\n\n🔗 GitLab Issue: ${gitlabResult.issueUrl}`
          : `🔗 GitLab Issue: ${gitlabResult.issueUrl}`;

        const updateResult = await updateFeishuTaskDescription(
          createResult.taskGuid,
          linkedDescription
        );

        if (!updateResult.success) {
          console.warn(
            `[FeishuTaskWorkflow] Failed to update task description: ${updateResult.error}`
          );
        }
      }

      const dueText = dueDate ? `\n- Due: ${dueDate}` : "";
      const assigneeText = assigneeOpenIds.length
        ? `\n- Assignees: ${assigneeOpenIds.join(", ")}`
        : "";
      const taskUrlText = createResult.taskUrl
        ? `\n- Task: ${createResult.taskUrl}`
        : "";

      return {
        result:
          `## Task created\n- Summary: ${summary}` +
          dueText +
          assigneeText +
          `\n- GitLab: ${gitlabResult.issueUrl}` +
          taskUrlText,
        intent,
      };
    }

    return {
      result: "Unsupported intent.",
      intent,
    };
  },
});

// ----------------------------------------------------------------------------
// Step 5: Format response
// ----------------------------------------------------------------------------
const formatResponseStep = createStep({
  id: "format-response",
  inputSchema: z.object({
    result: z.string(),
    intent: TaskIntentEnum,
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
  outputSchema: z.object({
    response: z.string(),
    intent: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { result, intent, needsConfirmation, confirmationData } = inputData;
    return {
      response: result,
      intent,
      needsConfirmation,
      confirmationData,
    };
  },
});

// ----------------------------------------------------------------------------
// Workflow definition
// ----------------------------------------------------------------------------
export const feishuTaskWorkflow = createWorkflow({
  id: "feishu-task",
  description: "Feishu task workflow for create/list/complete",
  inputSchema: baseWorkflowInputSchema,
  outputSchema: z.object({
    response: z.string().describe("Formatted response"),
    intent: z.string().describe("Classified intent"),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
})
  .then(classifyIntentStep)
  .then(parseRequestStep)
  .then(ensureAuthStep)
  .then(executeTaskStep)
  .then(formatResponseStep)
  .commit();

