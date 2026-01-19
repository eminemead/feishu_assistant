/**
 * Feishu Task Link Worker
 *
 * Uses PGMQ to retry linking Feishu tasks to GitLab issues.
 */

import {
  ackTaskLinkJob,
  createGitlabIssueFromTask,
  dequeueTaskLinkJobs,
  getGitlabIssueByTaskGuid,
  saveTaskLinkExtended,
  updateFeishuTaskDescription,
  type FeishuTaskDetails,
  type FeishuTaskLinkJobPayload,
  type TaskLinkQueueItem,
} from "./feishu-task-service";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_VISIBILITY_TIMEOUT_SEC = 120;
const DEFAULT_MAX_ATTEMPTS = 8;

let workerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

type WorkerConfig = {
  intervalMs: number;
  batchSize: number;
  visibilityTimeoutSec: number;
  maxAttempts: number;
};

function buildLinkedDescription(
  description: string | undefined,
  issueUrl: string
): string {
  if (!description) {
    return `🔗 GitLab Issue: ${issueUrl}`;
  }
  if (description.includes(issueUrl)) {
    return description;
  }
  return `${description}\n\n🔗 GitLab Issue: ${issueUrl}`;
}

function getWorkerConfig(): WorkerConfig {
  const intervalMs = Number(process.env.FEISHU_TASK_LINK_WORKER_INTERVAL_MS);
  const batchSize = Number(process.env.FEISHU_TASK_LINK_WORKER_BATCH_SIZE);
  const visibilityTimeoutSec = Number(process.env.FEISHU_TASK_LINK_WORKER_VISIBILITY_SEC);
  const maxAttempts = Number(process.env.FEISHU_TASK_LINK_WORKER_MAX_ATTEMPTS);

  return {
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : DEFAULT_INTERVAL_MS,
    batchSize: Number.isFinite(batchSize) ? batchSize : DEFAULT_BATCH_SIZE,
    visibilityTimeoutSec: Number.isFinite(visibilityTimeoutSec)
      ? visibilityTimeoutSec
      : DEFAULT_VISIBILITY_TIMEOUT_SEC,
    maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : DEFAULT_MAX_ATTEMPTS,
  };
}

function isWorkerEnabled(): boolean {
  return process.env.FEISHU_TASK_LINK_WORKER_ENABLED !== "false";
}

async function processJob(
  job: TaskLinkQueueItem,
  config: WorkerConfig
): Promise<boolean> {
  if (job.readCount >= config.maxAttempts) {
    console.warn(
      `[TaskLinkWorker] Dropping job ${job.msgId} after ${job.readCount} attempts`
    );
    await ackTaskLinkJob(job.msgId);
    return true;
  }

  const payload = job.payload as FeishuTaskLinkJobPayload;
  if (!payload?.taskGuid || !payload.summary || !payload.gitlabProject) {
    console.warn(
      `[TaskLinkWorker] Invalid payload for job ${job.msgId}, acking`,
      payload
    );
    await ackTaskLinkJob(job.msgId);
    return true;
  }

  const existing = await getGitlabIssueByTaskGuid(payload.taskGuid);
  if (existing) {
    console.log(
      `[TaskLinkWorker] Link already exists for task ${payload.taskGuid}, acking`
    );
    await ackTaskLinkJob(job.msgId);
    return true;
  }

  const members =
    payload.assigneeOpenIds?.map((id) => ({
      id,
      type: "user",
      role: "assignee",
    })) || [];

  const taskDetails: FeishuTaskDetails = {
    guid: payload.taskGuid,
    summary: payload.summary,
    description: payload.description,
    due: payload.dueTimestamp
      ? { timestamp: payload.dueTimestamp, is_all_day: true }
      : undefined,
    members,
    url: payload.taskUrl,
  };

  const gitlabResult = await createGitlabIssueFromTask(
    taskDetails,
    payload.taskUrl,
    payload.gitlabProject
  );

  if (!gitlabResult.success || !gitlabResult.issueIid || !gitlabResult.issueUrl) {
    console.warn(
      `[TaskLinkWorker] GitLab create failed for task ${payload.taskGuid}: ${gitlabResult.error}`
    );
    return false;
  }

  await saveTaskLinkExtended({
    gitlabProject: payload.gitlabProject,
    gitlabIssueIid: gitlabResult.issueIid,
    gitlabIssueUrl: gitlabResult.issueUrl,
    feishuTaskGuid: payload.taskGuid,
    feishuTaskUrl: payload.taskUrl,
  });

  const linkedDescription = buildLinkedDescription(
    payload.description,
    gitlabResult.issueUrl
  );
  const updateResult = await updateFeishuTaskDescription(
    payload.taskGuid,
    linkedDescription
  );
  if (!updateResult.success) {
    console.warn(
      `[TaskLinkWorker] Failed to update task description: ${updateResult.error}`
    );
  }

  await ackTaskLinkJob(job.msgId);
  console.log(
    `[TaskLinkWorker] Linked task ${payload.taskGuid} → ${gitlabResult.issueUrl}`
  );
  return true;
}

async function processBatch(config: WorkerConfig): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const jobs = await dequeueTaskLinkJobs({
      batchSize: config.batchSize,
      visibilityTimeoutSec: config.visibilityTimeoutSec,
    });

    if (!jobs.length) return;

    for (const job of jobs) {
      const success = await processJob(job, config);
      if (!success) {
        console.warn(
          `[TaskLinkWorker] Job ${job.msgId} failed, will retry`
        );
      }
    }
  } catch (error) {
    console.error("[TaskLinkWorker] Error processing batch:", error);
  } finally {
    isRunning = false;
  }
}

export function startFeishuTaskLinkWorker(): void {
  if (!isWorkerEnabled()) {
    console.log("[TaskLinkWorker] Disabled via env");
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[TaskLinkWorker] Missing Supabase config, skipping");
    return;
  }

  if (workerTimer) {
    console.warn("[TaskLinkWorker] Already running");
    return;
  }

  const config = getWorkerConfig();
  console.log(
    `[TaskLinkWorker] Starting (interval=${config.intervalMs}ms, batch=${config.batchSize})`
  );

  workerTimer = setInterval(() => {
    void processBatch(config);
  }, config.intervalMs);

  void processBatch(config);
}

export function stopFeishuTaskLinkWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
