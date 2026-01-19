import { client as feishuClient } from "./feishu-utils";

const FORM_SUBMIT_ACTION = "feishu_task_form_submit";
const FORM_CANCEL_ACTION = "feishu_task_form_cancel";

const DEFAULT_CONFIRM_PREFIX = "__feishu_task_confirm__";
const DEFAULT_CANCEL_PREFIX = "__feishu_task_cancel__";

export interface TaskConfirmationPayload {
  summary?: string;
  description?: string;
  dueDate?: string;
  assignees?: string[];
  assigneeOpenIds?: string[];
  [key: string]: unknown;
}

export interface TaskFormValues {
  summary?: string;
  description?: string;
  dueDate?: string;
  assignees?: string;
}

export interface TaskFormAction {
  type: "submit" | "cancel";
  context?: string;
  payload?: TaskConfirmationPayload;
  formValues?: TaskFormValues;
  confirmPrefix?: string;
  cancelPrefix?: string;
}

export interface TaskConfirmationCardOptions {
  conversationId: string;
  rootId: string;
  threadId?: string;
  payload: TaskConfirmationPayload;
  confirmPrefix?: string;
  cancelPrefix?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface TaskConfirmationSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function normalizeAssigneeList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergePayloadWithFormValues(
  payload: TaskConfirmationPayload,
  formValues?: TaskFormValues
): TaskConfirmationPayload {
  if (!formValues) return payload;

  const nextPayload: TaskConfirmationPayload = { ...payload };

  if (typeof formValues.summary === "string" && formValues.summary.trim()) {
    nextPayload.summary = formValues.summary.trim();
  }

  if (typeof formValues.description === "string") {
    nextPayload.description = formValues.description.trim();
  }

  if (typeof formValues.dueDate === "string") {
    const trimmed = formValues.dueDate.trim();
    nextPayload.dueDate = trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof formValues.assignees === "string") {
    const assignees = normalizeAssigneeList(formValues.assignees);
    if (assignees.length > 0) {
      nextPayload.assignees = assignees;
      nextPayload.assigneeOpenIds = undefined;
    } else {
      nextPayload.assignees = undefined;
      nextPayload.assigneeOpenIds = undefined;
    }
  }

  return nextPayload;
}

function extractFormValuesFromSource(source: unknown): TaskFormValues | undefined {
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as Record<string, unknown>;
  const values: TaskFormValues = {};

  if (typeof candidate.summary === "string") values.summary = candidate.summary;
  if (typeof candidate.description === "string") values.description = candidate.description;
  if (typeof candidate.dueDate === "string") values.dueDate = candidate.dueDate;
  if (typeof candidate.assignees === "string") values.assignees = candidate.assignees;

  return Object.keys(values).length > 0 ? values : undefined;
}

function extractFormValues(action: Record<string, unknown>, value: Record<string, unknown>): TaskFormValues | undefined {
  const candidates = [
    action.form_value,
    (action as any).formValue,
    action.form,
    (action as any).inputs,
    value.form_value,
    (value as any).formValue,
    value.form,
    (value as any).inputs,
    value.value,
  ];

  for (const candidate of candidates) {
    const extracted = extractFormValuesFromSource(candidate);
    if (extracted) return extracted;
  }

  return undefined;
}

export function parseTaskFormAction(action: unknown): TaskFormAction | null {
  if (!action || typeof action !== "object") return null;
  const actionObj = action as Record<string, unknown>;
  const value = actionObj.value;

  if (!value || typeof value !== "object") return null;
  const valueObj = value as Record<string, unknown>;
  const actionType = valueObj.action;

  if (actionType !== FORM_SUBMIT_ACTION && actionType !== FORM_CANCEL_ACTION) {
    return null;
  }

  const formValues = extractFormValues(actionObj, valueObj);
  const payload = typeof valueObj.payload === "object" ? (valueObj.payload as TaskConfirmationPayload) : undefined;

  return {
    type: actionType === FORM_SUBMIT_ACTION ? "submit" : "cancel",
    context: typeof valueObj.context === "string" ? valueObj.context : undefined,
    payload,
    formValues,
    confirmPrefix: typeof valueObj.confirmPrefix === "string" ? valueObj.confirmPrefix : undefined,
    cancelPrefix: typeof valueObj.cancelPrefix === "string" ? valueObj.cancelPrefix : undefined,
  };
}

export function buildTaskConfirmationValue(action: TaskFormAction): string | null {
  const confirmPrefix = action.confirmPrefix || DEFAULT_CONFIRM_PREFIX;
  const cancelPrefix = action.cancelPrefix || DEFAULT_CANCEL_PREFIX;

  if (action.type === "cancel") {
    return cancelPrefix;
  }

  const payload = mergePayloadWithFormValues(action.payload || {}, action.formValues);
  return `${confirmPrefix}:${JSON.stringify({ payload })}`;
}

function buildTaskConfirmationCardData(options: TaskConfirmationCardOptions): {
  cardData: Record<string, unknown>;
  contextPrefix: string;
} {
  const { conversationId, rootId, payload } = options;
  const contextPrefix = `${conversationId}|${rootId}`;

  const assignees =
    payload.assignees ||
    payload.assigneeOpenIds ||
    [];
  const assigneeText = Array.isArray(assignees) ? assignees.join(", ") : String(assignees || "");

  const confirmValue = {
    action: FORM_SUBMIT_ACTION,
    context: contextPrefix,
    payload,
    confirmPrefix: options.confirmPrefix || DEFAULT_CONFIRM_PREFIX,
    cancelPrefix: options.cancelPrefix || DEFAULT_CANCEL_PREFIX,
  };

  const cancelValue = {
    action: FORM_CANCEL_ACTION,
    context: contextPrefix,
    payload,
    confirmPrefix: options.confirmPrefix || DEFAULT_CONFIRM_PREFIX,
    cancelPrefix: options.cancelPrefix || DEFAULT_CANCEL_PREFIX,
  };

  const cardData = {
    schema: "2.0",
    header: {
      title: {
        tag: "plain_text",
        content: "任务确认 / Task Confirmation",
      },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "请确认或修改以下字段，然后提交创建任务。",
        },
        {
          tag: "form",
          elements: [
            {
              tag: "input",
              name: "summary",
              placeholder: {
                tag: "plain_text",
                content: "任务标题",
              },
              default_value: payload.summary || "",
            },
            {
              tag: "textarea",
              name: "description",
              placeholder: {
                tag: "plain_text",
                content: "任务描述（可选）",
              },
              default_value: payload.description || "",
            },
            {
              tag: "input",
              name: "dueDate",
              placeholder: {
                tag: "plain_text",
                content: "截止日期 YYYY-MM-DD（可选）",
              },
              default_value: payload.dueDate || "",
            },
            {
              tag: "input",
              name: "assignees",
              placeholder: {
                tag: "plain_text",
                content: "负责人（逗号分隔，可填 GitLab 用户名）",
              },
              default_value: assigneeText,
            },
          ],
          submit: {
            tag: "button",
            text: {
              tag: "plain_text",
              content: options.confirmLabel || "✅ 确认创建",
            },
            type: "primary",
            behaviors: [
              {
                type: "callback",
                value: confirmValue,
              },
            ],
          },
        },
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: options.cancelLabel || "❌ 取消",
          },
          type: "default",
          behaviors: [
            {
              type: "callback",
              value: cancelValue,
            },
          ],
        },
      ],
    },
  };

  return { cardData, contextPrefix };
}

export async function sendTaskConfirmationCard(
  options: TaskConfirmationCardOptions
): Promise<TaskConfirmationSendResult> {
  try {
    const { cardData } = buildTaskConfirmationCardData(options);

    let cardEntityId: string | undefined;
    try {
      const cardCreateResp = await feishuClient.cardkit.v1.card.create({
        data: {
          type: "card_json",
          data: JSON.stringify(cardData),
        },
      });

      const isCardSuccess = cardCreateResp.code === 0 || cardCreateResp.code === undefined;
      if (isCardSuccess && cardCreateResp.data?.card_id) {
        cardEntityId = cardCreateResp.data.card_id;
      } else {
        console.warn("⚠️ [TaskConfirmCard] CardKit creation failed:", cardCreateResp);
      }
    } catch (error) {
      console.warn("⚠️ [TaskConfirmCard] CardKit creation error:", error);
    }

    let createResp: any;
    if (options.rootId) {
      if (cardEntityId) {
        createResp = await feishuClient.im.message.reply({
          path: { message_id: options.rootId },
          data: {
            msg_type: "interactive",
            content: JSON.stringify({
              type: "card",
              data: { card_id: cardEntityId },
            }),
            reply_in_thread: true,
          },
        });
      } else {
        createResp = await feishuClient.im.message.reply({
          path: { message_id: options.rootId },
          data: {
            msg_type: "interactive",
            content: JSON.stringify({
              type: "card",
              data: JSON.stringify(cardData),
            }),
            reply_in_thread: true,
          },
        });
      }
    } else {
      createResp = await feishuClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: options.conversationId,
          msg_type: "interactive",
          content: JSON.stringify({
            type: "card",
            data: cardEntityId ? { card_id: cardEntityId } : JSON.stringify(cardData),
          }),
        },
      });
    }

    const isSuccess = typeof createResp.success === "function"
      ? createResp.success()
      : (createResp.code === 0 || createResp.code === undefined);
    const responseData = createResp.data || createResp;

    if (!isSuccess || !responseData?.message_id) {
      return {
        success: false,
        error: `Failed to send task confirmation card: ${createResp.msg || createResp.error || "unknown error"}`,
      };
    }

    return {
      success: true,
      messageId: responseData.message_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const _testOnly = {
  buildTaskConfirmationCardData,
  mergePayloadWithFormValues,
  normalizeAssigneeList,
};
