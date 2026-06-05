"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { useConversations, useDeleteConversation } from "@/lib/hooks/analysis";

export function ConversationList({
  reportIdPB,
  onOpen,
}: {
  reportIdPB: string;
  onOpen: (id: string) => void;
}) {
  const { data, isPending, error } = useConversations(reportIdPB);
  const del = useDeleteConversation(reportIdPB);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="p-4 text-sm text-destructive">Não foi possível carregar as conversas.</p>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="p-4">
        <EmptyState>
          <EmptyStateIcon>
            <MessageSquare className="size-5" />
          </EmptyStateIcon>
          <EmptyStateTitle>Sem conversas ainda</EmptyStateTitle>
          <EmptyStateDescription>
            Inicie uma conversa na aba &ldquo;Conversa&rdquo; — ela aparecerá aqui.
          </EmptyStateDescription>
        </EmptyState>
      </div>
    );
  }

  function onDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    del.mutate(id, {
      onSuccess: () => toast.success("Conversa removida."),
      onError: () => toast.error("Não foi possível remover a conversa."),
    });
  }

  return (
    <ul className="flex flex-col gap-2 p-4">
      {items.map((c) => (
        <li key={c._id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(c._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onOpen(c._id);
            }}
            className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
          >
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{c.title}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                {c.updatedAt && <span>{formatDateTime(c.updatedAt)}</span>}
                <span>· {c.messageCount} msg</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => onDelete(e, c._id)}
              disabled={del.isPending}
              aria-label="Remover conversa"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
