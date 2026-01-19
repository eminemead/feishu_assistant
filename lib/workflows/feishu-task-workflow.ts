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
import { generateText, type CoreMessage } from "ai";
import { z } from "zod";
import { getMastraModelSingle } from "../shared/model-router";
import {
  createFeishuTask,
  updateFeishuTaskStatus,
  createGitlabIssueFromTask,
  updateGitlabIssueFromTask,
  buildGitlabDescription,
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
const TASK_PREFIX_REGEX = /^(?:\/?(?:task|todo|任务|待办))\s*[:：-]?\s*/i;

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

function stripTaskPrefix(text: string): string {
  return text.replace(TASK_PREFIX_REGEX, "").trim();
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@([^\s]+)/g);
  if (!matches) return [];
  return matches
    .map((match) => match.replace(/^@/, "").trim())
    .filter(Boolean);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function resolveRelativeDate(raw: string, now: Date): string | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;

  const todayStr = formatDate(now);
  if (["today", "今天", "今"].includes(normalized)) {
    return todayStr;
  }
  if (["tomorrow", "明天"].includes(normalized)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return formatDate(tomorrow);
  }
  if (["后天"].includes(normalized)) {
    const dayAfter = new Date(now);
    dayAfter.setDate(now.getDate() + 2);
    return formatDate(dayAfter);
  }

  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysUntilFridayBase = (5 - dayOfWeek + 7) % 7;
  const thisFridayOffset = daysUntilFridayBase === 0 ? 7 : daysUntilFridayBase;
  const thisFriday = new Date(now);
  thisFriday.setDate(now.getDate() + thisFridayOffset);
  const nextFriday = new Date(thisFriday);
  nextFriday.setDate(thisFriday.getDate() + 7);

  const daysUntilWednesdayBase = (3 - dayOfWeek + 7) % 7;
  const nextWednesdayOffset = daysUntilWednesdayBase === 0 ? 7 : daysUntilWednesdayBase;
  const nextWednesday = new Date(now);
  nextWednesday.setDate(now.getDate() + nextWednesdayOffset);

  if (/(next\s*friday|下周五)/i.test(normalized)) {
    return formatDate(nextFriday);
  }
  if (/(this\s*friday|本周五|周五)/i.test(normalized)) {
    return formatDate(thisFriday);
  }
  if (/(next\s*wednesday|下周三|下周3|next\s*wed)/i.test(normalized)) {
    return formatDate(nextWednesday);
  }

  return undefined;
}

function extractDueDateFromText(text: string): string | undefined {
  if (!text) return undefined;
  const now = new Date();

  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch?.[0]) return isoMatch[0];

  const zhMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)/);
  if (zhMatch?.[1] && zhMatch?.[2]) {
    return normalizeDueDate(`${zhMatch[1]}/${zhMatch[2]}`);
  }

  const mdMatch = text.match(/\b\d{1,2}[\/\-]\d{1,2}\b/);
  if (mdMatch?.[0]) return normalizeDueDate(mdMatch[0]);

  const keywordMatch = text.match(
    /(?:截止|到期|due|ddl|deadline|before|by)\s*[:：]?\s*([^\s,，]+(?:\s+[^\s,，]+)?)/i
  );
  if (keywordMatch?.[1]) {
    const resolved =
      normalizeDueDate(keywordMatch[1]) || resolveRelativeDate(keywordMatch[1], now);
    if (resolved) return resolved;
  }

  const relativePatterns = [
    /今天|今日|today/i,
    /明天|tomorrow/i,
    /后天/i,
    /下周五|next\s*friday/i,
    /本周五|周五|this\s*friday/i,
    /下周三|next\s*wed(?:nesday)?/i,
  ];

  for (const pattern of relativePatterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      const resolved = resolveRelativeDate(match[0], now);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function normalizeDueDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const relative = resolveRelativeDate(trimmed, new Date());
  if (relative) return relative;

  const mdMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10);
    const day = parseInt(mdMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return formatDate(date);
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  return undefined;
}

function formatThreadContext(
  messages: CoreMessage[],
  currentQuery: string
): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const trimmedQuery = currentQuery.trim();
  const cleaned = messages
    .filter((msg) => msg.role === "user" && typeof msg.content === "string")
    .map((msg) => String(msg.content || "").trim())
    .filter(Boolean)
    .filter((content) => content !== trimmedQuery)
    .map((content) => (content === trimmedQuery ? content : stripTaskPrefix(content)))
    .filter((content) => content !== trimmedQuery);

  const unique = Array.from(new Set(cleaned));
  if (unique.length === 0) return undefined;

  const selected = unique.slice(-6);
  const bullets = selected.map((content) => `- ${content}`).join("\n");
  return `🧵 **上下文消息**\n${bullets}`;
}

async function summarizeTaskContext(
  contextBlock: string,
  query: string,
  model: ReturnType<typeof getMastraModelSingle>
): Promise<string | null> {
  try {
    const prompt = `Summarize the following task context into 3-5 concise bullet points.
Rules:
- Use Mandarin Chinese.
- Keep names, numbers, URLs, and technical terms as-is.
- Focus on actionable context for creating a task.

Task request: ${query}

Context:
${contextBlock}

Output format:
**上下文摘要**
- ...
- ...`;

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.2,
    });

    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    console.warn("[FeishuTaskWorkflow] Context summary failed:", error);
    return null;
  }
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
      return { ...inputData, intent: "create_task" as const };
    }

    if (lower.startsWith("/tasklist") || lower.startsWith("/tasks")) {
      return { ...inputData, intent: "list_tasks" as const };
    }
    if (lower.startsWith("/task") || lower.startsWith("/todo")) {
      return { ...inputData, intent: "create_task" as const };
    }
    if (lower.startsWith("/done") || lower.startsWith("/complete")) {
      return { ...inputData, intent: "complete_task" as const };
    }
    if (lower.startsWith("/taskhelp") || lower.startsWith("/help")) {
      return { ...inputData, intent: "help" as const };
    }

    if (/(list|tasks|task list|tasklist)/i.test(lower)) {
      return { ...inputData, intent: "list_tasks" as const };
    }
    if (/(complete|done|finish|reopen|undo)/i.test(lower)) {
      return { ...inputData, intent: "complete_task" as const };
    }
    if (/(create|new task|todo|task)/i.test(lower)) {
      return { ...inputData, intent: "create_task" as const };
    }
    if (/(gitlab|issue)/i.test(lower)) {
      return { ...inputData, intent: "link_gitlab" as const };
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
      const intent: TaskIntent =
        intentRaw === "create_task"
          ? "create_task"
          : intentRaw === "list_tasks"
          ? "list_tasks"
          : intentRaw === "complete_task"
          ? "complete_task"
          : intentRaw === "link_gitlab"
          ? "link_gitlab"
          : "help";

      return { ...inputData, intent } as const;
    } catch (error) {
      console.warn("[FeishuTaskWorkflow] Intent classification failed:", error);
      return { ...inputData, intent: "help" as const };
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

    let model: ReturnType<typeof getMastraModelSingle> | null = null;

    if (intent !== "help") {
      try {
        model = getMastraModelSingle(false);
        const now = new Date();
        const todayStr = formatDate(now);
        const tomorrowStr = resolveRelativeDate("tomorrow", now) || todayStr;
        const thisFridayStr = resolveRelativeDate("this friday", now) || todayStr;
        const nextFridayStr = resolveRelativeDate("next friday", now) || todayStr;
        const nextWednesdayStr = resolveRelativeDate("next wednesday", now) || todayStr;

        const prompt = `Extract task parameters as JSON (no markdown).
Return ONLY JSON with keys:
summary, description, dueDate, assignees, taskGuid, taskUrl,
tasklistName, tasklistGuid, limit, linkGitlab, gitlabProject, completed.
Use null for unknowns. assignees must be an array of strings (no @ prefix).
If a due date is mentioned, output dueDate in YYYY-MM-DD.
Today is ${todayStr}. Interpret:
- today/今天 = ${todayStr}
- tomorrow/明天 = ${tomorrowStr}
- this friday/本周五/周五 = ${thisFridayStr}
- next friday/下周五 = ${nextFridayStr}
- next wednesday/下周三 = ${nextWednesdayStr}
Strip leading "task/todo/待办/任务" prefixes from summary.

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

    if (params.summary) {
      params.summary = stripTaskPrefix(params.summary);
    }
    if (intent === "create_task" && !params.summary) {
      params.summary = stripTaskPrefix(query);
    }

    if (!params.assignees || params.assignees.length === 0) {
      const mentions = extractMentions(query);
      if (mentions.length > 0) {
        params.assignees = mentions;
      }
    }

    if (params.dueDate) {
      params.dueDate = normalizeDueDate(params.dueDate);
    }
    if (!params.dueDate) {
      const extractedDueDate = extractDueDateFromText(query);
      if (extractedDueDate) {
        params.dueDate = extractedDueDate;
      }
    }

    if (intent === "create_task") {
      const contextMessages = Array.isArray((inputData.context as any)?.threadMessages)
        ? ((inputData.context as any).threadMessages as CoreMessage[])
        : [];
      const contextBlock = formatThreadContext(contextMessages, query);
      if (contextBlock) {
        const shouldSummarize =
          process.env.FEISHU_TASK_CONTEXT_SUMMARY !== "false" &&
          contextBlock.length > 200 &&
          model;
        if (shouldSummarize && model) {
          const summary = await summarizeTaskContext(contextBlock, query, model);
          if (summary) {
            params.description = params.description
              ? `${params.description}\n\n---\n${summary}`
              : summary;
          } else {
            params.description = params.description
              ? `${params.description}\n\n---\n${contextBlock}`
              : contextBlock;
          }
        } else {
          params.description = params.description
            ? `${params.description}\n\n---\n${contextBlock}`
            : contextBlock;
        }
      }
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
    const { intent, params: rawParams, userId, query, chatId, rootId } = inputData;
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
          assignees: assignees.length ? assignees : undefined,
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

      const members = assigneeOpenIds.map((id) => ({
        id,
        type: "user",
        role: "assignee",
      }));

      const taskDetails: FeishuTaskDetails = {
        guid: "",
        summary,
        description: baseDescription || undefined,
        due,
        members,
      };

      const taskPromise = createFeishuTask({
        summary,
        description: baseDescription || undefined,
        dueDate,
        assigneeOpenIds: assigneeOpenIds.length ? assigneeOpenIds : undefined,
        creatorOpenId: isOpenId(userId) ? userId : undefined,
      });

      const gitlabPromise = createGitlabIssueFromTask(taskDetails, undefined, project);

      const [taskSettled, gitlabSettled] = await Promise.allSettled([
        taskPromise,
        gitlabPromise,
      ]);

      const taskResult =
        taskSettled.status === "fulfilled"
          ? taskSettled.value
          : {
              success: false,
              error:
                taskSettled.reason instanceof Error
                  ? taskSettled.reason.message
                  : String(taskSettled.reason),
            };

      const gitlabResult =
        gitlabSettled.status === "fulfilled"
          ? gitlabSettled.value
          : {
              success: false,
              error:
                gitlabSettled.reason instanceof Error
                  ? gitlabSettled.reason.message
                  : String(gitlabSettled.reason),
            };

      if (!taskResult.success && !gitlabResult.success) {
        return {
          result: `Failed to create task and GitLab issue.\nTask error: ${taskResult.error}\nGitLab error: ${gitlabResult.error}`,
          intent,
        };
      }

      if (taskResult.success && !gitlabResult.success) {
        let queueNote = "";
        if (taskResult.taskGuid) {
          const queuedId = await enqueueTaskLinkJob({
            taskGuid: taskResult.taskGuid,
            taskUrl: taskResult.taskUrl || undefined,
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
            (taskResult.taskUrl ? `\nTask: ${taskResult.taskUrl}` : "") +
            "\nGitLab link pending; will sync later." +
            queueNote,
          intent,
        };
      }

      if (!taskResult.success && gitlabResult.success && gitlabResult.issueUrl) {
        return {
          result:
            `GitLab issue created, but Feishu task creation failed: ${taskResult.error}` +
            `\nGitLab: ${gitlabResult.issueUrl}\nPlease retry task creation if needed.`,
          intent,
        };
      }

      if (!gitlabResult.success || !gitlabResult.issueIid || !gitlabResult.issueUrl) {
        return {
          result: `Unexpected GitLab issue result: ${gitlabResult.error || "unknown error"}`,
          intent,
        };
      }

      if (taskResult.success && taskResult.taskGuid) {
        try {
          await saveTaskLinkExtended({
            gitlabProject: project,
            gitlabIssueIid: gitlabResult.issueIid,
            gitlabIssueUrl: gitlabResult.issueUrl,
            feishuTaskGuid: taskResult.taskGuid,
            feishuTaskUrl: taskResult.taskUrl,
          });
        } catch (error) {
          console.warn("[FeishuTaskWorkflow] Failed to save task link:", error);
        }

        const linkedDescription = baseDescription
          ? `${baseDescription}\n\n🔗 GitLab Issue: ${gitlabResult.issueUrl}`
          : `🔗 GitLab Issue: ${gitlabResult.issueUrl}`;

        const updateResult = await updateFeishuTaskDescription(
          taskResult.taskGuid,
          linkedDescription
        );

        if (!updateResult.success) {
          console.warn(
            `[FeishuTaskWorkflow] Failed to update task description: ${updateResult.error}`
          );
        }
      }

      if (taskResult.success && taskResult.taskUrl) {
        const gitlabDescription = buildGitlabDescription(
          { ...taskDetails, description: baseDescription || undefined },
          taskResult.taskUrl
        );
        const updateGitlabResult = await updateGitlabIssueFromTask(
          gitlabResult.issueIid,
          { ...taskDetails, description: gitlabDescription },
          ["description"],
          project
        );
        if (!updateGitlabResult.success) {
          console.warn(
            `[FeishuTaskWorkflow] Failed to update GitLab issue description: ${updateGitlabResult.error}`
          );
        }
      }

      const dueText = dueDate ? `\n- Due: ${dueDate}` : "";
      const assigneeText = assigneeOpenIds.length
        ? `\n- Assignees: ${assigneeOpenIds.join(", ")}`
        : "";
      const taskUrlText = taskResult.taskUrl
        ? `\n- Task: ${taskResult.taskUrl}`
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

export const _testOnly = {
  extractMentions,
  extractDueDateFromText,
  normalizeDueDate,
  stripTaskPrefix,
  formatThreadContext,
};

