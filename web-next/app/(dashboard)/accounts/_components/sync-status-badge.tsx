"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SyncStatus } from "@/lib/api/endpoints/accounts";

function formatDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Badge inline com o estado do último sync da conta. Renderiza null quando
 * `state === 'ok'` — sucesso é o caminho feliz, não polui a tabela. Só aparece
 * quando há algo pra mostrar: sincronizando ou falha.
 */
export function SyncStatusBadge({ status }: { status?: SyncStatus }) {
  if (!status) return null;

  if (status.state === "in_progress") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
            <Loader2 className="size-3 animate-spin" />
            Sincronizando
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Tentativa {status.attemptsMade ?? 1} em curso
          {status.lastJobId ? ` (job ${status.lastJobId})` : ""}.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status.state === "failed") {
    const when = formatDate(status.lastErrorAt);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            Falha
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-1">
            {when && (
              <div className="text-[10px] uppercase tracking-wide opacity-70">
                {when}
                {status.attemptsMade ? ` • ${status.attemptsMade} tentativas` : ""}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words">
              {status.lastError ?? "Erro desconhecido."}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
