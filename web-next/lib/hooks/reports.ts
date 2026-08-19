"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import {
  reportDetailSchema,
  reportListItemSchema,
  reportsKeys,
  syncEnqueueResponseSchema,
  type ReportDetail,
  type ReportListItem,
  type SyncEnqueueResponse,
} from "@/lib/api/endpoints/reports";

const FIFTY_FIVE_MINUTES = 55 * 60 * 1000;

/** GET /api/reports/me — list reports the authenticated user can access. */
export function useMyReports() {
  return useQuery<ReportListItem[]>({
    queryKey: reportsKeys.me(),
    queryFn: async () => {
      const data = await apiClient("/api/reports/me");
      return z.array(reportListItemSchema).parse(data);
    },
  });
}

/** GET /api/reports/all — full inventory. MANAGER only.
 * Backend returns `{ reports: Report[], count: number }`. */
const allReportsResponseSchema = z.object({
  reports: z.array(reportListItemSchema),
  count: z.number().optional(),
});

export function useAllReports(includeHidden = false, options?: { enabled?: boolean }) {
  return useQuery<ReportListItem[]>({
    queryKey: [...reportsKeys.all, "all", { includeHidden }] as const,
    queryFn: async () => {
      const data = await apiClient("/api/reports/all", {
        query: includeHidden ? { includeHidden: "true" } : undefined,
      });
      return allReportsResponseSchema.parse(data).reports;
    },
    enabled: options?.enabled ?? true,
  });
}

/**
 * PATCH /api/reports/hide/:id — soft-hide a report. MANAGER only.
 *
 * `id` is the Mongo `_id`, NOT the Power BI GUID. Backend responds with the
 * updated document; we invalidate every reports query so the workspace grid,
 * the sidebar, and the global list all reflect the change.
 */
export function useHideReport() {
  const qc = useQueryClient();
  return useMutation<ReportListItem, Error, string>({
    mutationFn: async (id) => {
      const data = await apiClient(`/api/reports/hide/${encodeURIComponent(id)}`, {
        method: "PATCH",
      });
      return reportListItemSchema.parse(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.all });
    },
  });
}

/**
 * PATCH /api/reports/unhide/:id — restore a soft-hidden report. MANAGER only.
 * Idempotent. Same invalidation strategy as `useHideReport`.
 */
export function useUnhideReport() {
  const qc = useQueryClient();
  return useMutation<ReportListItem, Error, string>({
    mutationFn: async (id) => {
      const data = await apiClient(`/api/reports/unhide/${encodeURIComponent(id)}`, {
        method: "PATCH",
      });
      return reportListItemSchema.parse(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportsKeys.all });
    },
  });
}

/**
 * GET /api/reports/:reportIdPB — single report detail incl. embedUrl + Azure token.
 *
 * Refetched every 55 minutes to obtain a fresh Azure access token (the legacy
 * backend refreshes its Azure credentials on each call via RefreshToken.refresh).
 * The embed component should call `report.setAccessToken(data.accountID.token)`
 * whenever the query data changes.
 *
 * `initialData` lets callers hydrate from an RSC pre-fetch and skip the first roundtrip.
 */
export function useReportDetail(reportIdPB: string, initialData?: ReportDetail) {
  return useQuery<ReportDetail>({
    queryKey: reportsKeys.detail(reportIdPB),
    queryFn: async () => {
      const data = await apiClient(`/api/reports/${encodeURIComponent(reportIdPB)}`);
      return reportDetailSchema.parse(data);
    },
    initialData,
    refetchInterval: FIFTY_FIVE_MINUTES,
    refetchIntervalInBackground: false,
    staleTime: FIFTY_FIVE_MINUTES - 60_000,
  });
}

/**
 * POST /api/reports/syncronize — encolar sync para TODAS las cuentas del usuario.
 *
 * El backend NO espera al sync: devuelve 202 con la lista de jobIds (uno por
 * cuenta) y procesa en background vía BullMQ. El progreso y resultado llegan
 * por SSE (eventos `sync.started`/`sync.progress`/`sync.completed`/`sync.failed`
 * keyed por `jobId`). Consumir con `useSyncEvents()` desde el page.
 *
 * MANAGER only. Backend preserva el typo original (`syncronize`).
 */
export function useSyncAllReports() {
  return useMutation<SyncEnqueueResponse>({
    mutationFn: async () => {
      const data = await apiClient("/api/reports/syncronize", { method: "POST" });
      return syncEnqueueResponseSchema.parse(data);
    },
    // No invalidamos acá — el éxito del enqueue NO implica sync completado.
    // La invalidación corre cuando llega `sync.completed` (ver accounts/page.tsx).
  });
}

/**
 * POST /api/reports/syncronize/:accountId — encolar sync de UNA cuenta.
 *
 * Idempotente: si ya hay un job en vuelo para esa cuenta, el backend devuelve
 * el jobId existente con `dedup: true`.
 *
 * MANAGER only.
 */
export function useSyncAccountReports() {
  return useMutation<SyncEnqueueResponse, Error, string>({
    mutationFn: async (accountId) => {
      const data = await apiClient(
        `/api/reports/syncronize/${encodeURIComponent(accountId)}`,
        { method: "POST" },
      );
      return syncEnqueueResponseSchema.parse(data);
    },
  });
}
