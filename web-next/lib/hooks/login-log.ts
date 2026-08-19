"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import {
  loginLogKeys,
  loginLogSchema,
  loginLogUserSummarySchema,
  type LoginLog,
  type LoginLogUserSummary,
} from "@/lib/api/endpoints/login-log";

/**
 * GET /api/login-log/all — MANAGER only. Full login audit (raw records).
 *
 * Este endpoint devolve TODOS os registros brutos (potencialmente 40k+). Use com
 * cuidado: para a visão agregada por usuário, prefira {@link useLoginLogsUsersSummary}.
 * O parâmetro `enabled` permite adiar o fetch até que o usuário efetivamente precise
 * do dataset bruto (ex.: view "Por data" ou histórico de um usuário).
 */
export function useLoginLogs(opts: { enabled?: boolean } = {}) {
  return useQuery<LoginLog[]>({
    queryKey: loginLogKeys.list(),
    queryFn: async () => {
      const data = await apiClient("/api/login-log/all");
      return z.array(loginLogSchema).parse(data);
    },
    staleTime: 30_000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * GET /api/login-log/resumo-usuarios — MANAGER only.
 * Retorna uma linha por usuário cadastrado (inclusive quem nunca logou),
 * com `accesos` (contagem) e `ultimoAcceso`. Feito para a tela de Auditoria.
 */
export function useLoginLogsUsersSummary() {
  return useQuery<LoginLogUserSummary[]>({
    queryKey: loginLogKeys.usersSummary(),
    queryFn: async () => {
      const data = await apiClient("/api/login-log/resumo-usuarios");
      return z.array(loginLogUserSummarySchema).parse(data);
    },
    staleTime: 30_000,
  });
}

/** GET /api/login-log/:id — MANAGER only. Logs for a specific user. */
export function useLoginLogsByUser(userId: string | undefined) {
  return useQuery<LoginLog[]>({
    queryKey: userId ? loginLogKeys.byUser(userId) : ["login-log", "user", "__none"],
    queryFn: async () => {
      if (!userId) return [];
      const data = await apiClient(`/api/login-log/${encodeURIComponent(userId)}`);
      return z.array(loginLogSchema).parse(data);
    },
    enabled: Boolean(userId),
  });
}
