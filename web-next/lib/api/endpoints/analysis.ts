import { z } from "zod";

/**
 * Schemas + query keys for the `/analysis` module.
 *
 * Backend contract: legacy/app/src/app/modules/analysis/dto/analysis-response.dto.ts.
 * `POST /analysis/report/:reportId` runs an agentic loop (LLM ↔ DAX) and returns a
 * structured narrative. `GET /analysis/report/:reportId/history` lists prior analyses
 * (without `daxRuns`); `GET /analysis/:id` returns the full stored document.
 *
 * Defensive shapes: legacy returns raw Mongo docs in some flows — `.passthrough()` so
 * extra fields don't break parsing, and parse only what the UI consumes.
 */

export const AnalysisLanguage = {
  PT_BR: "pt-BR",
  EN_US: "en-US",
} as const;
export type AnalysisLanguage = (typeof AnalysisLanguage)[keyof typeof AnalysisLanguage];

/** One DAX query the model requested, with its result sample (traceability). */
export const daxQuerySchema = z
  .object({
    purpose: z.string().optional().default(""),
    query: z.string().optional().default(""),
    rowCount: z.number().optional().default(0),
    truncated: z.boolean().optional(),
    sampleRows: z.array(z.record(z.string(), z.unknown())).optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type DaxQuery = z.infer<typeof daxQuerySchema>;

export const analysisUsageSchema = z
  .object({
    promptTokens: z.number().optional().default(0),
    completionTokens: z.number().optional().default(0),
    totalTokens: z.number().optional().default(0),
    estimatedCostUsd: z.number().optional().default(0),
    model: z.string().optional().default(""),
  })
  .passthrough();

export type AnalysisUsage = z.infer<typeof analysisUsageSchema>;

export const analysisStatusSchema = z.enum(["success", "partial", "failed"]).catch("success");

/** Response of `POST /analysis/report/:reportId`. */
export const analysisResponseSchema = z
  .object({
    reportId: z.string(),
    analysisId: z.string(),
    generatedAt: z.string(),
    language: z.string().optional().default(AnalysisLanguage.PT_BR),
    summary: z.string().optional().default(""),
    keyFindings: z.array(z.string()).optional().default([]),
    anomalies: z.array(z.string()).optional().default([]),
    recommendations: z.array(z.string()).optional().default([]),
    daxQueries: z.array(daxQuerySchema).optional().default([]),
    usage: analysisUsageSchema.optional(),
    cached: z.boolean().optional().default(false),
    status: analysisStatusSchema,
  })
  .passthrough();

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

/** Body of `POST /analysis/report/:reportId` (see legacy AnalyzeReportDto). */
export interface AnalyzeReportBody {
  language?: AnalysisLanguage;
  focus?: string;
  refresh?: boolean;
}

/**
 * History list item — the lean Mongo doc returned by `GET .../history` and `GET /all`
 * (projected WITHOUT `daxRuns`). Mongo `_id` + timestamps; field names mirror the entity.
 */
export const analysisHistoryItemSchema = z
  .object({
    _id: z.string(),
    reportId: z.string().optional(),
    reportName: z.string().optional(),
    language: z.string().optional(),
    focus: z.string().optional(),
    summary: z.string().optional().default(""),
    keyFindings: z.array(z.string()).optional().default([]),
    anomalies: z.array(z.string()).optional().default([]),
    recommendations: z.array(z.string()).optional().default([]),
    status: analysisStatusSchema.optional(),
    userEmail: z.string().optional(),
    estimatedCostUsd: z.number().optional(),
    model: z.string().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type AnalysisHistoryItem = z.infer<typeof analysisHistoryItemSchema>;

export const analysisHistoryResponseSchema = z
  .object({
    items: z.array(analysisHistoryItemSchema).default([]),
    count: z.number().optional().default(0),
    limit: z.number().optional(),
    skip: z.number().optional(),
  })
  .passthrough();

export type AnalysisHistoryResponse = z.infer<typeof analysisHistoryResponseSchema>;

/**
 * Full stored document from `GET /analysis/:id`. Carries `daxRuns` (the persisted DAX
 * runs) — normalized here to the same `daxQueries` shape the result renderer consumes.
 */
export const analysisDetailSchema = analysisHistoryItemSchema
  .extend({
    datasetId: z.string().optional(),
    groupId: z.string().optional(),
    daxRuns: z.array(daxQuerySchema).optional().default([]),
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    iterations: z.number().optional(),
    generatedAt: z.string().optional(),
  })
  .passthrough();

export type AnalysisDetail = z.infer<typeof analysisDetailSchema>;

// ----- Chat conversacional + gráficos -----

export const chartTypeSchema = z.enum(["bar", "line", "area", "pie"]).catch("bar");

/** Spec de gráfico emitida pelo LLM (generative UI). Dados embutidos. */
export const chartSpecSchema = z
  .object({
    title: z.string().optional().default("Gráfico"),
    type: chartTypeSchema,
    data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).default([]),
    xKey: z.string(),
    series: z
      .array(
        z.object({
          key: z.string(),
          label: z.string().optional(),
        }),
      )
      .default([]),
  })
  .passthrough();

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export const chatRoleSchema = z.enum(["user", "assistant"]);

/** Uma mensagem persistida de uma conversa (GET /analysis/conversation/:id). */
export const chatMessageSchema = z
  .object({
    role: chatRoleSchema,
    content: z.string().optional().default(""),
    charts: z.array(chartSpecSchema).optional().default([]),
    daxRuns: z.array(daxQuerySchema).optional().default([]),
    createdAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Resposta de POST /analysis/report/:id/chat — um turno. */
export const chatResponseSchema = z
  .object({
    conversationId: z.string(),
    reply: z.string().optional().default(""),
    charts: z.array(chartSpecSchema).optional().default([]),
    daxQueries: z.array(daxQuerySchema).optional().default([]),
    usage: analysisUsageSchema.optional(),
    status: analysisStatusSchema,
  })
  .passthrough();

export type ChatResponse = z.infer<typeof chatResponseSchema>;

/** Body de POST /analysis/report/:id/chat. */
export interface ChatBody {
  conversationId?: string;
  message: string;
  language?: AnalysisLanguage;
}

export const conversationListItemSchema = z
  .object({
    _id: z.string(),
    title: z.string().optional().default("Conversa"),
    messageCount: z.number().optional().default(0),
    updatedAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

export const conversationsResponseSchema = z
  .object({
    items: z.array(conversationListItemSchema).default([]),
    count: z.number().optional().default(0),
    limit: z.number().optional(),
    skip: z.number().optional(),
  })
  .passthrough();

export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;

/** Documento completo de uma conversa (GET /analysis/conversation/:id). */
export const conversationDetailSchema = z
  .object({
    _id: z.string(),
    reportId: z.string().optional(),
    reportName: z.string().optional(),
    language: z.string().optional(),
    title: z.string().optional().default("Conversa"),
    messages: z.array(chatMessageSchema).default([]),
    model: z.string().optional(),
    totalTokens: z.number().optional(),
    estimatedCostUsd: z.number().optional(),
    status: analysisStatusSchema.optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const analysisKeys = {
  all: ["analysis"] as const,
  history: (reportIdPB: string) => [...analysisKeys.all, "history", reportIdPB] as const,
  detail: (id: string) => [...analysisKeys.all, "detail", id] as const,
  conversations: (reportIdPB: string) => [...analysisKeys.all, "conversations", reportIdPB] as const,
  conversation: (id: string) => [...analysisKeys.all, "conversation", id] as const,
} as const;
