"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import {
  analysisDetailSchema,
  analysisHistoryResponseSchema,
  analysisKeys,
  analysisResponseSchema,
  chatResponseSchema,
  conversationDetailSchema,
  conversationsResponseSchema,
  type AnalysisDetail,
  type AnalysisHistoryResponse,
  type AnalysisResponse,
  type AnalyzeReportBody,
  type ChatBody,
  type ChatResponse,
  type ConversationDetail,
  type ConversationsResponse,
} from "@/lib/api/endpoints/analysis";

/**
 * Trigger an AI analysis of a report.
 *
 * `POST /api/analysis/report/:reportIdPB` — one-shot, agentic (LLM ↔ DAX) on the backend.
 * Latency is high (20-60s, no streaming); callers should show a long-running loading state.
 * On success we refresh the report's history list so a newly stored analysis shows up.
 */
export function useAnalyzeReport(reportIdPB: string) {
  const qc = useQueryClient();

  return useMutation<AnalysisResponse, Error, AnalyzeReportBody | void>({
    mutationFn: async (body) => {
      const data = await apiClient(`/api/analysis/report/${encodeURIComponent(reportIdPB)}`, {
        method: "POST",
        body: body ?? {},
      });
      return analysisResponseSchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: analysisKeys.history(reportIdPB) });
    },
  });
}

/** Paginated history of analyses stored for a report (most recent first; no daxRuns). */
export function useAnalysisHistory(reportIdPB: string, enabled = true) {
  return useQuery<AnalysisHistoryResponse>({
    queryKey: analysisKeys.history(reportIdPB),
    queryFn: async () => {
      const data = await apiClient(
        `/api/analysis/report/${encodeURIComponent(reportIdPB)}/history`,
        { query: { limit: 20, skip: 0 } },
      );
      return analysisHistoryResponseSchema.parse(data);
    },
    enabled: enabled && Boolean(reportIdPB),
  });
}

/** Full stored analysis document (includes daxRuns). Lazily fetched when a history row opens. */
export function useAnalysisDetail(id: string | null) {
  return useQuery<AnalysisDetail>({
    queryKey: analysisKeys.detail(id ?? ""),
    queryFn: async () => {
      const data = await apiClient(`/api/analysis/${encodeURIComponent(id as string)}`);
      return analysisDetailSchema.parse(data);
    },
    enabled: Boolean(id),
  });
}

// ----- Chat conversacional + conversaciones -----

/**
 * Send one chat turn. Stateless on the client: pass `conversationId` to continue
 * an existing conversation, omit it to start a new one (the response carries the
 * new id). High latency (20-60s, no streaming). On success refreshes the
 * conversations list so a newly created conversation shows up.
 */
export function useAnalysisChat(reportIdPB: string) {
  const qc = useQueryClient();

  return useMutation<ChatResponse, Error, ChatBody>({
    mutationFn: async (body) => {
      const data = await apiClient(`/api/analysis/report/${encodeURIComponent(reportIdPB)}/chat`, {
        method: "POST",
        body,
      });
      return chatResponseSchema.parse(data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: analysisKeys.conversations(reportIdPB) });
    },
  });
}

/** Paginated list of the user's conversations for a report (no messages). */
export function useConversations(reportIdPB: string, enabled = true) {
  return useQuery<ConversationsResponse>({
    queryKey: analysisKeys.conversations(reportIdPB),
    queryFn: async () => {
      const data = await apiClient(
        `/api/analysis/report/${encodeURIComponent(reportIdPB)}/conversations`,
        { query: { limit: 30, skip: 0 } },
      );
      return conversationsResponseSchema.parse(data);
    },
    enabled: enabled && Boolean(reportIdPB),
  });
}

/** Full conversation (with messages). Lazily fetched when a conversation opens. */
export function useConversation(id: string | null) {
  return useQuery<ConversationDetail>({
    queryKey: analysisKeys.conversation(id ?? ""),
    queryFn: async () => {
      const data = await apiClient(`/api/analysis/conversation/${encodeURIComponent(id as string)}`);
      return conversationDetailSchema.parse(data);
    },
    enabled: Boolean(id),
  });
}

export function useDeleteConversation(reportIdPB: string) {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (id) => {
      await apiClient(`/api/analysis/conversation/${encodeURIComponent(id)}`, { method: "DELETE" });
      return { deleted: true };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: analysisKeys.conversations(reportIdPB) });
    },
  });
}
