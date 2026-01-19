/**
 * Browser Approval Workflow
 *
 * Orchestrates approval decisions using agent-browser CLI:
 * - Open approval page
 * - Snapshot accessibility tree
 * - Extract request details + decision buttons
 * - Recommend approve/reject/inquiry
 * - Human-in-loop confirm before clicking
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { generateText } from "ai";
import { getMastraModelSingle } from "../shared/model-router";
import {
  agentBrowserOpen,
  agentBrowserSnapshot,
  agentBrowserClick,
} from "../services/agent-browser-service";
import { baseWorkflowInputSchema, type ConfirmationConfig } from "./types";
import {
  BROWSER_APPROVAL_CANCEL_PREFIX,
  BROWSER_APPROVAL_CONFIRM_PREFIX,
  BROWSER_APPROVAL_URL_REGEX,
} from "../shared/browser-approval";

const DEFAULT_SESSION = process.env.AGENT_BROWSER_SESSION || "groot-approval";
const DEFAULT_STATE_PATH = process.env.AGENT_BROWSER_STATE_PATH;
const DEFAULT_HEADED = process.env.AGENT_BROWSER_HEADED === "true";

const ApprovalModeEnum = z.enum(["review", "confirm", "cancel"]);
const DecisionEnum = z.enum(["approve", "reject", "inquiry"]);
type ApprovalDecision = z.infer<typeof DecisionEnum>;

const confirmationConfigSchema = z
  .object({
    confirmLabel: z.string().optional(),
    cancelLabel: z.string().optional(),
    confirmValuePrefix: z.string().optional(),
    cancelValue: z.string().optional(),
  })
  .optional();

const extractionSchema = z
  .object({
    requestType: z.string().optional(),
    requester: z.string().optional(),
    dates: z.string().optional(),
    duration: z.string().optional(),
    reason: z.string().optional(),
    policySummary: z.string().optional(),
    currentStatus: z.string().optional(),
    attachments: z.array(z.string()).optional(),
    decisionButtons: z
      .object({
        approveRef: z.string().optional(),
        rejectRef: z.string().optional(),
        inquiryRef: z.string().optional(),
      })
      .optional(),
    missingInfo: z.array(z.string()).optional(),
    summary: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

type ApprovalExtraction = z.infer<typeof extractionSchema>;

const decisionSchema = z.object({
  decision: DecisionEnum,
  rationale: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
});

const approvalContextSchema = baseWorkflowInputSchema.extend({
  mode: ApprovalModeEnum,
  requestUrl: z.string().optional(),
  session: z.string(),
  statePath: z.string().optional(),
  headed: z.boolean(),
  confirmationPayload: z.string().optional(),
});

function stripCodeFences(text: string): string {
  return text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(stripCodeFences(raw)) as T;
  } catch {
    const trimmed = stripCodeFences(raw);
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n...[truncated]";
}

function getDecisionLabel(decision: ApprovalDecision, chinese = false): string {
  if (decision === "approve") return chinese ? "同意" : "Approve";
  if (decision === "reject") return chinese ? "拒绝" : "Reject";
  return chinese ? "询问" : "Inquiry";
}

function pickDecisionButton(
  decision: ApprovalDecision,
  buttons?: ApprovalExtraction["decisionButtons"]
): string | undefined {
  if (!buttons) return undefined;
  if (decision === "approve") return buttons.approveRef;
  if (decision === "reject") return buttons.rejectRef;
  return buttons.inquiryRef;
}

const LLM_TIMEOUT_MS = 60000; // 60s timeout for LLM calls
const PAGE_OPEN_TIMEOUT_MS = 300000; // 5min timeout for slow approval pages
const SNAPSHOT_TIMEOUT_MS = 60000; // 60s timeout for snapshots

async function extractApprovalContext(snapshotText: string): Promise<ApprovalExtraction> {
  const model = getMastraModelSingle(false);
  const prompt = `You are extracting structured data from an accessibility snapshot of an approval page.
This may be a Chinese NIO internal system. Use ONLY the snapshot content. Return JSON only.

Fields:
- requestType: PTO | sick leave | data access | field access | other (look for 申请类型, 字段申请, etc.)
- requester (look for 申请人)
- dates (look for 申请日期, 有效期)
- duration
- reason (look for 申请原因)
- policySummary (short)
- currentStatus (look for 审核中, 待审批, 已完成, etc.)
- attachments (array)
- decisionButtons: { approveRef, rejectRef, inquiryRef } - look for 同意/拒绝/询问 text or @e refs
- missingInfo (array)
- summary (1-2 lines describing what's being requested)
- notes (optional)

Snapshot:
${truncate(snapshotText, 12000)}`;

  console.log(`[BrowserApproval] Extracting context from snapshot (${snapshotText.length} chars)...`);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), LLM_TIMEOUT_MS);
  
  try {
    const { text } = await generateText({ 
      model, 
      prompt, 
      temperature: 0,
      abortSignal: abortController.signal,
    });
    console.log(`[BrowserApproval] Extraction complete`);
    const parsed = safeJsonParse<ApprovalExtraction>(text, {});
    const validated = extractionSchema.safeParse(parsed);
    return validated.success ? validated.data : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function decideApproval(
  extraction: ApprovalExtraction
): Promise<z.infer<typeof decisionSchema>> {
  const model = getMastraModelSingle(false);
  const prompt = `You are deciding approve/reject/inquiry based on the extracted approval data.
This is a data/field access request in a Chinese company system.

Guidelines:
- If the request is for standard data access with a clear business reason, recommend "approve"
- If missingInfo is non-empty or something seems off, choose "inquiry"
- Only recommend "reject" for clearly inappropriate requests

Return JSON only with:
- decision: approve | reject | inquiry
- rationale: array of short bullet reasons (can be in Chinese if the data is Chinese)
- questions: array of questions (only if inquiry)

Extracted data:
${JSON.stringify(extraction, null, 2)}`;

  console.log(`[BrowserApproval] Deciding approval action...`);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), LLM_TIMEOUT_MS);
  
  try {
    const { text } = await generateText({ 
      model, 
      prompt, 
      temperature: 0,
      abortSignal: abortController.signal,
    });
    console.log(`[BrowserApproval] Decision complete`);
    const parsed = safeJsonParse<z.infer<typeof decisionSchema>>(text, {
      decision: "inquiry",
      rationale: [],
      questions: [],
    });
    const validated = decisionSchema.safeParse(parsed);
    return validated.success ? validated.data : { decision: "inquiry", rationale: [], questions: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDecisionButtons(snapshotText: string): Promise<{
  approveRef?: string;
  rejectRef?: string;
  inquiryRef?: string;
}> {
  // First try to find Chinese text buttons (common in NIO approval pages)
  // These render as text nodes, not button elements, so we use text selectors
  const hasChineseApprove = /同意/.test(snapshotText);
  const hasChineseReject = /拒绝/.test(snapshotText);
  const hasChineseInquiry = /询问/.test(snapshotText);
  
  if (hasChineseApprove || hasChineseReject || hasChineseInquiry) {
    console.log(`[BrowserApproval] Found Chinese button text patterns`);
    return {
      approveRef: hasChineseApprove ? 'text=同意' : undefined,
      rejectRef: hasChineseReject ? 'text=拒绝' : undefined,
      inquiryRef: hasChineseInquiry ? 'text=询问' : undefined,
    };
  }

  // Fallback: use LLM to find @e refs for English buttons
  const model = getMastraModelSingle(false);
  const prompt = `Find the approve/reject/inquiry button refs in this accessibility snapshot.
Return JSON only: { approveRef, rejectRef, inquiryRef } using @e refs.

Snapshot:
${truncate(snapshotText, 12000)}`;

  console.log(`[BrowserApproval] Resolving decision buttons via LLM...`);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), LLM_TIMEOUT_MS);
  
  try {
    const { text } = await generateText({ 
      model, 
      prompt, 
      temperature: 0,
      abortSignal: abortController.signal,
    });
    console.log(`[BrowserApproval] Button resolution complete`);
    const parsed = safeJsonParse<{ approveRef?: string; rejectRef?: string; inquiryRef?: string }>(
      text,
      {}
    );
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

// ----------------------------------------------------------------------------
// Step 1: Parse input (review vs confirm/cancel)
// ----------------------------------------------------------------------------
type ApprovalMode = z.infer<typeof ApprovalModeEnum>;

const parseInputStep = createStep({
  id: "parse-input",
  inputSchema: baseWorkflowInputSchema,
  outputSchema: approvalContextSchema,
  execute: async ({ inputData }) => {
    const { query, context } = inputData;
    const trimmed = query.trim();
    const session =
      (typeof context?.session === "string" && context?.session) || DEFAULT_SESSION;
    const statePath =
      (typeof context?.statePath === "string" && context?.statePath) || DEFAULT_STATE_PATH;
    const headed =
      (typeof context?.headed === "boolean" && context?.headed) || DEFAULT_HEADED;

    if (trimmed.startsWith(BROWSER_APPROVAL_CONFIRM_PREFIX)) {
      const mode: ApprovalMode = "confirm";
      return {
        ...inputData,
        mode,
        confirmationPayload: trimmed.slice(BROWSER_APPROVAL_CONFIRM_PREFIX.length),
        session,
        statePath,
        headed,
      } as const;
    }

    if (trimmed.startsWith(BROWSER_APPROVAL_CANCEL_PREFIX)) {
      const mode: ApprovalMode = "cancel";
      return {
        ...inputData,
        mode,
        session,
        statePath,
        headed,
      } as const;
    }

    const urlMatch = trimmed.match(BROWSER_APPROVAL_URL_REGEX);
    const requestUrl = urlMatch ? urlMatch[0] : undefined;
    const mode: ApprovalMode = "review";

    return {
      ...inputData,
      mode,
      requestUrl,
      session,
      statePath,
      headed,
    } as const;
  },
});

// ----------------------------------------------------------------------------
// Step 2A: Review + recommendation
// ----------------------------------------------------------------------------
const reviewApprovalStep = createStep({
  id: "review-approval",
  inputSchema: approvalContextSchema,
  outputSchema: z.object({
    result: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    confirmationConfig: confirmationConfigSchema,
  }),
  execute: async ({ inputData }) => {
    const { requestUrl, session, statePath, headed } = inputData;
    if (!requestUrl) {
      return {
        result:
          "Missing approval URL. Provide a link like:\n- https://groot.nio.com/wf3/lark/approve/<id> (data permissions)\n- https://workflow.niohome.com/src/html/approve.html?... (PTO/sick leave)",
      };
    }

    console.log(`[BrowserApproval] Opening: ${requestUrl} (session=${session}, headed=${headed})`);
    const openResult = await agentBrowserOpen(requestUrl, { session, statePath, headed, timeoutMs: PAGE_OPEN_TIMEOUT_MS });
    console.log(`[BrowserApproval] Page opened: ${openResult.stdout.substring(0, 200)}`);

    // Check if redirected to login page
    const loginRedirectPatterns = [
      /signin\.nio\.com/i,
      /login/i,
      /sso.*callback/i,
      /账号登录/,
      /蔚来账号/,
    ];
    const wasRedirectedToLogin = loginRedirectPatterns.some(
      (pattern) => pattern.test(openResult.stdout) || pattern.test(openResult.stderr)
    );

    if (wasRedirectedToLogin) {
      console.log(`[BrowserApproval] Detected login redirect`);
      return {
        result: `🔐 **Authentication Required**

The approval page requires NIO login. Setup options:

**Option 1: Use Chrome with remote debugging (recommended)**
\`\`\`bash
# 1. Start Chrome with debugging enabled
/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

# 2. Login to NIO in that Chrome window

# 3. Add to .env:
AGENT_BROWSER_CDP=9222
\`\`\`

**Option 2: Use headed mode each time**
\`\`\`bash
# Add to .env:
AGENT_BROWSER_HEADED=true
\`\`\`
Then approve in the browser window that opens.

After setup, restart the server and try again.`,
      };
    }

    console.log(`[BrowserApproval] Taking snapshot...`);
    const snapshot = await agentBrowserSnapshot({
      session,
      json: true,
      depth: 6,
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
    console.log(`[BrowserApproval] Snapshot taken: ${snapshot.raw.length} chars`);

    const snapshotText = snapshot.raw;

    // Double-check snapshot content for login page (in case redirect wasn't caught)
    const snapshotHasLogin = loginRedirectPatterns.some((pattern) => pattern.test(snapshotText));
    if (snapshotHasLogin && !snapshotText.includes("approve") && !snapshotText.includes("审批")) {
      console.log(`[BrowserApproval] Snapshot shows login page`);
      return {
        result: `🔐 **Authentication Required**

The page content shows a login screen. Please set up an authenticated browser session.

**Setup:**
\`\`\`bash
agent-browser --headed --state ~/.agent-browser/nio-auth.json open "${requestUrl}"
# Login manually, then add AGENT_BROWSER_STATE_PATH to .env
\`\`\``,
      };
    }

    let extraction = await extractApprovalContext(snapshotText);
    const needsButtonFallback =
      !extraction.decisionButtons?.approveRef &&
      !extraction.decisionButtons?.rejectRef &&
      !extraction.decisionButtons?.inquiryRef;
    if (needsButtonFallback) {
      const buttonSnapshot = await agentBrowserSnapshot({
        session,
        json: true,
        interactiveOnly: true,
        depth: 4,
        timeoutMs: SNAPSHOT_TIMEOUT_MS,
      });
      const buttonRefs = await resolveDecisionButtons(buttonSnapshot.raw);
      extraction = {
        ...extraction,
        decisionButtons: { ...(extraction.decisionButtons || {}), ...buttonRefs },
      };
    }
    const decisionResult = await decideApproval(extraction);

    const missingInfo = extraction.missingInfo || [];
    let decision: ApprovalDecision = decisionResult.decision;
    if (missingInfo.length > 0) {
      decision = "inquiry";
    }

    let buttonRef = pickDecisionButton(decision, extraction.decisionButtons);
    if (!buttonRef && decision !== "inquiry" && extraction.decisionButtons?.inquiryRef) {
      decision = "inquiry";
      buttonRef = extraction.decisionButtons.inquiryRef;
    }

    if (!buttonRef) {
      return {
        result:
          "Could not locate approval buttons from the page snapshot. Try refreshing the page or sharing another link.",
      };
    }

    const summaryLines: string[] = [];
    if (extraction.requester) summaryLines.push(`- Requester: ${extraction.requester}`);
    if (extraction.requestType) summaryLines.push(`- Type: ${extraction.requestType}`);
    if (extraction.dates) summaryLines.push(`- Dates: ${extraction.dates}`);
    if (extraction.duration) summaryLines.push(`- Duration: ${extraction.duration}`);
    if (extraction.reason) summaryLines.push(`- Reason: ${extraction.reason}`);
    if (extraction.currentStatus) summaryLines.push(`- Status: ${extraction.currentStatus}`);
    if (extraction.policySummary)
      summaryLines.push(`- Policy: ${extraction.policySummary}`);

    if (extraction.attachments?.length) {
      summaryLines.push(`- Attachments: ${extraction.attachments.join(", ")}`);
    }

    if (missingInfo.length) {
      summaryLines.push(`- Missing: ${missingInfo.join("; ")}`);
    }

    const rationale = decisionResult.rationale?.length
      ? decisionResult.rationale.map((item) => `- ${item}`).join("\n")
      : "- Based on the policy and request details on the page.";

    const questions =
      decision === "inquiry" && decisionResult.questions?.length
        ? decisionResult.questions.map((q) => `- ${q}`).join("\n")
        : "";

    const responseParts = [
      "**Approval Request Summary**",
      summaryLines.length ? summaryLines.join("\n") : "- (No structured fields detected)",
      "",
      `**Recommendation: ${getDecisionLabel(decision).toUpperCase()}**`,
      rationale,
    ];

    if (questions) {
      responseParts.push("", "**Inquiry Questions**", questions);
    }

    responseParts.push(
      "",
      `**Next Step**: Click confirm to ${getDecisionLabel(decision)} on the page.`
    );

    const confirmationData = JSON.stringify({
      action: decision,
      requestUrl,
      session,
      statePath,
      headed,
      buttonRef,
      rationale: decisionResult.rationale || [],
      questions: decisionResult.questions || [],
      extractedSummary: extraction.summary || "",
    });

    const confirmLabel =
      decision === "approve"
        ? "✅ Approve"
        : decision === "reject"
        ? "🛑 Reject"
        : "❓ Inquiry";
    const confirmationConfig: ConfirmationConfig = {
      confirmLabel,
      cancelLabel: "❌ Cancel",
      confirmValuePrefix: BROWSER_APPROVAL_CONFIRM_PREFIX,
      cancelValue: BROWSER_APPROVAL_CANCEL_PREFIX,
    };

    return {
      result: responseParts.join("\n"),
      needsConfirmation: true,
      confirmationData,
      confirmationConfig,
    };
  },
});

// ----------------------------------------------------------------------------
// Step 2B: Confirm + click
// ----------------------------------------------------------------------------
const confirmApprovalStep = createStep({
  id: "confirm-approval",
  inputSchema: approvalContextSchema,
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { confirmationPayload, session, statePath, headed } = inputData;
    if (!confirmationPayload) {
      return { result: "Missing confirmation payload." };
    }

    const parsed = safeJsonParse<{
      action?: ApprovalDecision;
      requestUrl?: string;
      questions?: string[];
      buttonRef?: string;
    }>(confirmationPayload, {});

    const action = parsed.action || "inquiry";
    const requestUrl = parsed.requestUrl;
    if (!requestUrl) {
      return { result: "Missing approval URL in confirmation data." };
    }

    console.log(`[BrowserApproval] Confirming action=${action} url=${requestUrl}`);
    const openResult = await agentBrowserOpen(requestUrl, { session, statePath, headed, timeoutMs: PAGE_OPEN_TIMEOUT_MS });

    // Check if session expired and redirected to login
    const loginRedirectPatterns = [
      /signin\.nio\.com/i,
      /login/i,
      /sso.*callback/i,
      /账号登录/,
      /蔚来账号/,
    ];
    const wasRedirectedToLogin = loginRedirectPatterns.some(
      (pattern) => pattern.test(openResult.stdout) || pattern.test(openResult.stderr)
    );

    if (wasRedirectedToLogin) {
      return {
        result: `🔐 **Session Expired**

The browser session has expired. Please re-authenticate using one of the setup methods (Chrome CDP or headed mode) and try again.`,
      };
    }

    const snapshot = await agentBrowserSnapshot({
      session,
      json: true,
      interactiveOnly: true,
      depth: 6,
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });

    const buttons = await resolveDecisionButtons(snapshot.raw);
    const resolvedRef = pickDecisionButton(action, buttons);
    const buttonRef = resolvedRef || parsed.buttonRef;

    if (!buttonRef) {
      return {
        result:
          "Could not resolve the approval button on the refreshed page. Try again or open the page manually.",
      };
    }

    await agentBrowserClick(buttonRef, { session, timeoutMs: 30000 });

    const followupNote =
      action === "inquiry" && parsed.questions?.length
        ? `\n\nIf a modal asks for details, respond with:\n${parsed.questions
            .map((q) => `- ${q}`)
            .join("\n")}`
        : "";

    return {
      result: `✅ Clicked ${getDecisionLabel(action)} button.${followupNote}`,
    };
  },
});

// ----------------------------------------------------------------------------
// Step 2C: Cancel
// ----------------------------------------------------------------------------
const cancelApprovalStep = createStep({
  id: "cancel-approval",
  inputSchema: approvalContextSchema,
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async () => {
    return { result: "Cancelled approval action." };
  },
});

// ----------------------------------------------------------------------------
// Step 3: Format response
// ----------------------------------------------------------------------------
const formatResponseStep = createStep({
  id: "format-response",
  inputSchema: z.object({
    result: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    confirmationConfig: confirmationConfigSchema,
  }),
  outputSchema: z.object({
    response: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    confirmationConfig: confirmationConfigSchema,
  }),
  execute: async ({ inputData }) => {
    const { result, needsConfirmation, confirmationData, confirmationConfig } = inputData;
    return {
      response: result,
      needsConfirmation,
      confirmationData,
      confirmationConfig,
    };
  },
});

// ----------------------------------------------------------------------------
// Workflow definition
// ----------------------------------------------------------------------------
export const browserApprovalWorkflow = createWorkflow({
  id: "browser-approval",
  description: "Review and approve web-based PTO/sick/access requests",
  inputSchema: baseWorkflowInputSchema,
  outputSchema: z.object({
    response: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    confirmationConfig: confirmationConfigSchema,
  }),
})
  .then(parseInputStep)
  .branch([
    [
      async ({ inputData }) => inputData?.mode === "review",
      reviewApprovalStep,
    ],
    [
      async ({ inputData }) => inputData?.mode === "confirm",
      confirmApprovalStep,
    ],
    [
      async ({ inputData }) => inputData?.mode === "cancel",
      cancelApprovalStep,
    ],
  ])
  .map(async ({ getStepResult }) => {
    const reviewResult = getStepResult("review-approval");
    const confirmResult = getStepResult("confirm-approval");
    const cancelResult = getStepResult("cancel-approval");

    const branchResult = reviewResult || confirmResult || cancelResult;
    if (branchResult) {
      // Cast to expected shape since getStepResult returns {} in Mastra's types
      const typed = branchResult as {
        result?: string;
        needsConfirmation?: boolean;
        confirmationData?: string;
        confirmationConfig?: { confirmLabel?: string; cancelLabel?: string; confirmValuePrefix?: string; cancelValue?: string };
      };
      return {
        result: typed.result || "No response",
        needsConfirmation: typed.needsConfirmation,
        confirmationData: typed.confirmationData,
        confirmationConfig: typed.confirmationConfig,
      };
    }

    return { result: "No matching branch executed." };
  })
  .then(formatResponseStep)
  .commit();
