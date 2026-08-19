"use client";

import { useMemo, useState } from "react";
import { CalendarClock, History, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ROLES } from "@/lib/api/endpoints/users";
import { useLoginLogs, useLoginLogsUsersSummary } from "@/lib/hooks/login-log";
import { roleLabel } from "@/lib/auth/roles";

import { ByDateTable } from "./_components/by-date-table";
import { ByUserTable } from "./_components/by-user-table";
import {
  summaryToAggregated,
  toRow,
  type AggregatedUser,
  type LoginLogRow,
} from "./_components/types";
import { UserHistorySheet } from "./_components/user-history-sheet";

type RoleFilter = "all" | (typeof ROLES)[number];
type View = "by-user" | "by-date";

export default function LoginLogPage() {
  // Resumo por usuário (backend aggregation) — inclui usuários sem logins.
  // Fonte primária da tabela "Por usuário".
  const {
    data: summary = [],
    isPending: summaryPending,
    error: summaryError,
  } = useLoginLogsUsersSummary();

  // Registros brutos — necessários para "Por data" e para o histórico do sheet.
  // Só ativamos quando o usuário mudar para a view "by-date" ou abrir um usuário.
  const [view, setView] = useState<View>("by-user");
  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  const rawEnabled = view === "by-date" || selectedUserKey !== null;
  const {
    data: logs = [],
    isPending: rawPending,
    error: rawError,
  } = useLoginLogs({ enabled: rawEnabled });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const aggregated = useMemo<AggregatedUser[]>(() => {
    const mapped = summary.map(summaryToAggregated);
    const q = search.trim().toLowerCase();
    return mapped.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
      );
    });
  }, [summary, search, roleFilter]);

  const rows = useMemo<LoginLogRow[]>(() => {
    const mapped = logs.map(toRow);
    const q = search.trim().toLowerCase();
    return mapped.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
      );
    });
  }, [logs, search, roleFilter]);

  const error = summaryError ?? (rawEnabled ? rawError : null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria de logins</h1>
        </div>
        <Badge variant="secondary" className="font-mono">
          {summary.length} {summary.length === 1 ? "usuário" : "usuários"}
        </Badge>
      </header>
      <p className="text-sm text-muted-foreground">
        Histórico completo de logins. Restrito a MANAGER.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome ou e-mail…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v as RoleFilter)}
          >
            <SelectTrigger size="sm" className="h-8 w-full text-xs sm:w-40">
              <SelectValue placeholder="Filtrar por função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as funções</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => {
            if (v === "by-user" || v === "by-date") setView(v);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="by-user" aria-label="Agrupar por usuário" className="text-xs">
            <Users className="size-3.5" />
            Por usuário
          </ToggleGroupItem>
          <ToggleGroupItem value="by-date" aria-label="Ordenar por data" className="text-xs">
            <CalendarClock className="size-3.5" />
            Por data
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            Error: {(error as Error).message}
          </CardContent>
        </Card>
      ) : view === "by-user" ? (
        <ByUserTable
          data={aggregated}
          loading={summaryPending}
          onSelectUser={setSelectedUserKey}
          emptyState={
            summary.length === 0
              ? "Sem usuários cadastrados."
              : "Sem resultados para os filtros aplicados."
          }
        />
      ) : (
        <ByDateTable
          rows={rows}
          loading={rawPending}
          emptyState={
            logs.length === 0
              ? "Sem registros de login."
              : "Sem resultados para os filtros aplicados."
          }
        />
      )}

      <UserHistorySheet
        rows={rows}
        selectedUserKey={selectedUserKey}
        onOpenChange={(open) => {
          if (!open) setSelectedUserKey(null);
        }}
      />
    </div>
  );
}
