// Notification domain model and request schema for the internal Feishu
// notification service.
//
// This file is intentionally Mastra-agnostic and Feishu-SDK-agnostic:
// callers describe *what* they want delivered (target, kind, payload, meta),
// leaving *how* to deliver it (cards vs text, streaming vs static, chart
// rendering, etc.) to the server-side implementation.

import { z } from "zod";

/**
 * Logical caller/source of a notification.
 *
 * Examples:
 * - "cursor"      → ad-hoc local agent analysis
 * - "amp"         → AMP workflow
 * - "batch-job"   → scheduled backend
 * - "mastra"      → internal usages from workflows
 */
export const NotificationSourceSchema = z.enum([
  "cursor",
  "amp",
  "batch-job",
  "mastra",
  "unknown",
]);

export type NotificationSource = z.infer<typeof NotificationSourceSchema>;

/**
 * Target of a notification from the caller's perspective.
 *
 * We distinguish between:
 * - concrete identifiers (chat_id, user_id, open_id, email)
 * - logical names, which are mapped to concrete targets on the server side.
 *
 * Callers SHOULD prefer logical_name unless they are tightly coupled to a
 * specific chat/user.
 */
export const NotificationTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat_id"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("user_id"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("open_id"),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("email"),
    value: z.string().email(),
  }),
  z.object({
    type: z.literal("logical_name"),
    /**
     * Human-meaningful identifier that the backend maps to a concrete
     * Feishu destination, e.g.:
     * - "okr_ops_group"
     * - "finance_daily"
     */
    value: z.string().min(1),
  }),
]);

export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

/**
 * Notification "kind" describes the high-level content type.
 *
 * - "text"         → short, plain text messages
 * - "markdown"     → narrative reports with headings, lists, etc.
 * - "card"         → interactive cards (pre-built or referenced by ID)
 * - "chart_report" → structured results + chart specifications
 */
export const NotificationKindSchema = z.enum([
  "text",
  "markdown",
  "card",
  "chart_report",
]);

export type NotificationKind = z.infer<typeof NotificationKindSchema>;

/**
 * Meta information supplied by the caller, used for observability, traceability,
 * and idempotency.
 */
export const NotificationMetaSchema = z.object({
  source: NotificationSourceSchema.default("unknown"),
  /**
   * Cross-system correlation identifier (e.g. workflow/run ID).
   * Useful for stitching together logs across tools and the notification
   * service.
   */
  correlationId: z.string().min(1).optional(),
  /**
   * Optional idempotency key supplied by the caller. When used, the server
   * can guarantee at-most-once semantics for logically identical sends that
   * share the same key.
   */
  idempotencyKey: z.string().min(1).optional(),
});

export type NotificationMeta = z.infer<typeof NotificationMetaSchema>;

// --- Payload variants -------------------------------------------------------

export const TextPayloadSchema = z.object({
  text: z.string().min(1),
});

export type TextPayload = z.infer<typeof TextPayloadSchema>;

export const MarkdownPayloadSchema = z.object({
  markdown: z.string().min(1),
  /**
   * Optional short title used by some delivery implementations (e.g. card
   * headers or summaries). Callers MAY omit this; the server can derive or
   * ignore it.
   */
  title: z.string().min(1).optional(),
});

export type MarkdownPayload = z.infer<typeof MarkdownPayloadSchema>;

/**
 * Card payload for callers that already have an interactive card prepared.
 *
 * Two options:
 * - reference by cardEntityId (preferred when reusing existing cards)
 * - inline cardJson for one-off cards (the server MAY choose to materialize it)
 */
export const CardPayloadSchema = z.object({
  // If provided, the server can directly send this card entity.
  cardEntityId: z.string().min(1).optional(),
  // Optional raw card JSON for scenarios where the caller constructs the card.
  cardJson: z.unknown().optional(),
  /**
   * If true, the implementation MAY choose to send this as a reply in an
   * existing thread, using additional context not modeled here yet.
   */
  preferThreadReply: z.boolean().optional(),
});

export type CardPayload = z.infer<typeof CardPayloadSchema>;

/**
 * Chart report payload describes structured results plus chart specifications.
 *
 * This is intentionally generic; the server is responsible for mapping chart
 * specs to our existing chart-generation toolchain (e.g. Vega-Lite, Mermaid)
 * and deciding whether to embed as markdown or images in cards.
 */
export const ChartSpecSchema = z.object({
  /**
   * Logical chart type, e.g. "vega-lite", "mermaid".
   */
  chartType: z.string().min(1),
  /**
   * Specific visualization subtype, e.g. "bar", "line", "pie".
   */
  subType: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  /**
   * Arbitrary JSON payload; expected structure depends on chartType/subType.
   * For example, for Vega-Lite bar charts this might be:
   *   Array<{ category: string; value: number }>
   */
  data: z.unknown(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export const ChartReportPayloadSchema = z.object({
  /**
   * High-level summary in markdown, e.g. the narrative report around the charts.
   */
  summaryMarkdown: z.string().min(1),
  /**
   * Optional short title for card headers or summaries.
   */
  title: z.string().min(1).optional(),
  /**
   * One or more chart specifications that the server can render using our
   * existing visualization utilities.
   */
  charts: z.array(ChartSpecSchema).min(1),
});

export type ChartReportPayload = z.infer<typeof ChartReportPayloadSchema>;

export const NotificationPayloadSchema = z.union([
  TextPayloadSchema,
  MarkdownPayloadSchema,
  CardPayloadSchema,
  ChartReportPayloadSchema,
]);

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

/**
 * Complete notification request body as expected by the internal API.
 * This schema is also used server-side to validate inputs at runtime.
 *
 * NOTE: This is a version-agnostic schema; API versioning is handled at the
 * routing level (e.g. /internal/notify/feishu/v1). New versions should prefer
 * adding fields rather than breaking or reusing this schema.
 */
export const NotificationRequestSchema = z.object({
  target: NotificationTargetSchema,
  kind: NotificationKindSchema,
  payload: NotificationPayloadSchema,
  meta: NotificationMetaSchema.optional(),
});

export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

// --- API response / error contracts -----------------------------------------

/**
 * Machine-readable error codes for the notification API.
 *
 * These are intentionally coarse-grained; clients should not rely on wording
 * of human-readable messages.
 */
export const NotificationErrorCodeSchema = z.enum([
  // Request/auth issues
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "INVALID_TARGET",
  "INVALID_PAYLOAD",
  // Server-side issues
  "FEISHU_ERROR",
  "INTERNAL_ERROR",
]);

export type NotificationErrorCode = z.infer<typeof NotificationErrorCodeSchema>;

export const NotificationSuccessResponseSchema = z.object({
  status: z.literal("sent"),
  /**
   * Primary Feishu message identifier for the delivered notification.
   */
  messageId: z.string().min(1),
  /**
   * Optional card identifiers when the implementation sends an interactive
   * card (or streaming card) as part of the notification.
   */
  cardId: z.string().min(1).optional(),
  cardEntityId: z.string().min(1).optional(),
});

export type NotificationSuccessResponse = z.infer<
  typeof NotificationSuccessResponseSchema
>;

export const NotificationErrorResponseSchema = z.object({
  status: z.literal("error"),
  errorCode: NotificationErrorCodeSchema,
  /**
   * Human-readable error description for logs and debugging. Clients MAY
   * surface this to humans, but must not depend on its exact text.
   */
  message: z.string().min(1),
});

export type NotificationErrorResponse = z.infer<
  typeof NotificationErrorResponseSchema
>;

export const NotificationApiResponseSchema = z.union([
  NotificationSuccessResponseSchema,
  NotificationErrorResponseSchema,
]);

export type NotificationApiResponse = z.infer<
  typeof NotificationApiResponseSchema
>;

