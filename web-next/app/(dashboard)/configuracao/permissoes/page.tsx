"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUpdateUserReports, useUsers } from "@/lib/hooks/users";
import { useAccounts } from "@/lib/hooks/accounts";
import { useWorkspacesByAccount } from "@/lib/hooks/groups";
import { type UserListItem } from "@/lib/api/endpoints/users";
import { type Group } from "@/lib/api/endpoints/groups";

interface AccountRef {
  id: string;
  name: string;
}

function userId(u: UserListItem): string | undefined {
  return u._id ?? u.id;
}

export default function PermissoesPage() {
  const { data: users = [], isPending: usersPending, error: usersError } = useUsers();
  const { data: accounts = [], isPending: accountsPending, error: accountsError } = useAccounts();
  const update = useUpdateUserReports();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  const candidateUsers = useMemo(
    () =>
      users
        .filter((u) => u.role === "user")
        .sort((a, b) => {
          const an = a.name?.trim() ?? "";
          const bn = b.name?.trim() ?? "";
          if (!an && !bn) return 0;
          if (!an) return 1;
          if (!bn) return -1;
          return an.localeCompare(bn, "pt-BR", { sensitivity: "base" });
        }),
    [users],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateUsers;
    return candidateUsers.filter((u) => {
      const haystack = `${u.name ?? ""} ${u.email ?? ""} ${u.userIslv ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [candidateUsers, search]);

  const selectedUser = useMemo(
    () => users.find((u) => userId(u) === selectedId),
    [users, selectedId],
  );

  useEffect(() => {
    if (!selectedUser) {
      setSelectedReports(new Set());
      return;
    }
    setSelectedReports(new Set(selectedUser.reportsByPB ?? []));
  }, [selectedUser]);

  const accountRefs: AccountRef[] = useMemo(
    () =>
      accounts.map((a) => ({
        id: a._id,
        name: a.nameAccount || a.email || a._id,
      })),
    [accounts],
  );

  function toggleReport(reportIdPB: string) {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportIdPB)) next.delete(reportIdPB);
      else next.add(reportIdPB);
      return next;
    });
  }

  function selectAllInWorkspace(group: Group) {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      for (const r of group.report ?? []) {
        if (r.reportIdPB) next.add(r.reportIdPB);
      }
      return next;
    });
  }

  function clearAllInWorkspace(group: Group) {
    setSelectedReports((prev) => {
      const next = new Set(prev);
      for (const r of group.report ?? []) {
        if (r.reportIdPB) next.delete(r.reportIdPB);
      }
      return next;
    });
  }

  function handleSave() {
    if (!selectedUser) return;
    const id = userId(selectedUser);
    if (!id) return;
    update.mutate(
      { userId: id, reportIdPB: Array.from(selectedReports) },
      {
        onSuccess: (data) => {
          const skippedCount = data?.skipped?.length ?? 0;
          if (skippedCount > 0) {
            toast.success(
              `Permissões atualizadas. ${skippedCount} relatório(s) ignorado(s) por não existirem mais.`,
            );
          } else {
            toast.success("Permissões atualizadas.");
          }
        },
        onError: (err) =>
          toast.error((err as Error).message ?? "Não foi possível atualizar."),
      },
    );
  }

  const hasChanges = useMemo(() => {
    if (!selectedUser) return false;
    const current = new Set(selectedUser.reportsByPB ?? []);
    if (current.size !== selectedReports.size) return true;
    for (const r of selectedReports) if (!current.has(r)) return true;
    return false;
  }, [selectedUser, selectedReports]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-6xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Permissões</h1>
        <p className="text-sm text-muted-foreground">
          Selecione um usuário e atribua os relatórios disponíveis nas suas contas BI.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* LEFT: user picker */}
        <aside className="flex min-h-0 flex-col rounded-md border border-border bg-card">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {usersError ? (
              <p className="p-4 text-xs text-destructive">
                {(usersError as Error).message ?? "Erro ao carregar usuários."}
              </p>
            ) : usersPending ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {candidateUsers.length === 0
                  ? "Nenhum usuário com role 'user'."
                  : "Sem resultados."}
              </p>
            ) : (
              <ul className="p-1">
                {filtered.map((u) => {
                  const id = userId(u);
                  const active = id === selectedId;
                  return (
                    <li key={id ?? u.email}>
                      <button
                        type="button"
                        onClick={() => id && setSelectedId(id)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left transition-colors",
                          "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                          active && "bg-accent",
                        )}
                      >
                        <span className="text-sm font-medium leading-tight">
                          {u.name ?? "(sem nome)"}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight">
                          {u.email ?? "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </aside>

        {/* RIGHT: details + tree */}
        <section className="flex min-h-0 flex-col rounded-md border border-border bg-card">
          {!selectedUser ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState>
                <EmptyStateIcon>
                  <ShieldCheck />
                </EmptyStateIcon>
                <EmptyStateTitle>Selecione um usuário</EmptyStateTitle>
                <EmptyStateDescription>
                  Escolha um usuário à esquerda para editar seus relatórios.
                </EmptyStateDescription>
              </EmptyState>
            </div>
          ) : accountsError ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="text-xs text-destructive">
                {(accountsError as Error).message ?? "Erro ao carregar contas BI."}
              </p>
            </div>
          ) : accountsPending ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : accountRefs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState>
                <EmptyStateIcon>
                  <ShieldCheck />
                </EmptyStateIcon>
                <EmptyStateTitle>Sem contas BI cadastradas</EmptyStateTitle>
                <EmptyStateDescription>
                  Cadastre uma conta BI antes de atribuir relatórios.
                </EmptyStateDescription>
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {selectedUser.name ?? "(sem nome)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedUser.email ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedReports.size} selecionados
                  </Badge>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!hasChanges || update.isPending}
                  >
                    {update.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 p-3">
                  {accountRefs.map((acc) => (
                    <AccountSection
                      key={acc.id}
                      account={acc}
                      selectedReports={selectedReports}
                      onToggle={toggleReport}
                      onSelectAll={selectAllInWorkspace}
                      onClearAll={clearAllInWorkspace}
                    />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

interface AccountSectionProps {
  account: AccountRef;
  selectedReports: Set<string>;
  onToggle: (reportIdPB: string) => void;
  onSelectAll: (group: Group) => void;
  onClearAll: (group: Group) => void;
}

function AccountSection({
  account,
  selectedReports,
  onToggle,
  onSelectAll,
  onClearAll,
}: AccountSectionProps) {
  const { data, isPending, error } = useWorkspacesByAccount(account.id);

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <Building2 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {account.name}
        </span>
        {data?.countReports !== undefined && (
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {data.countReports} relatórios
          </Badge>
        )}
      </div>

      <div className="p-2">
        {error ? (
          <p className="p-2 text-xs text-destructive">
            {(error as Error).message ?? "Erro ao carregar workspaces."}
          </p>
        ) : isPending ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (data?.groups.length ?? 0) === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            Nenhum workspace nessa conta.
          </p>
        ) : (
          <ul className="space-y-1">
            {data!.groups.map((g) => (
              <WorkspaceItem
                key={g.groupIdPB}
                group={g}
                selectedReports={selectedReports}
                onToggle={onToggle}
                onSelectAll={onSelectAll}
                onClearAll={onClearAll}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface WorkspaceItemProps {
  group: Group;
  selectedReports: Set<string>;
  onToggle: (reportIdPB: string) => void;
  onSelectAll: (group: Group) => void;
  onClearAll: (group: Group) => void;
}

function WorkspaceItem({
  group,
  selectedReports,
  onToggle,
  onSelectAll,
  onClearAll,
}: WorkspaceItemProps) {
  const [open, setOpen] = useState(false);
  const reports = group.report ?? [];
  const selectedCount = reports.reduce(
    (acc, r) => (r.reportIdPB && selectedReports.has(r.reportIdPB) ? acc + 1 : acc),
    0,
  );
  const allSelected = reports.length > 0 && selectedCount === reports.length;

  return (
    <li className="rounded-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="flex-1 truncate font-medium uppercase">
            {group.name ?? group.groupIdPB}
          </span>
          <Badge
            variant={selectedCount > 0 ? "default" : "outline"}
            className="font-mono text-[10px]"
          >
            {selectedCount}/{reports.length}
          </Badge>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => (allSelected ? onClearAll(group) : onSelectAll(group))}
          disabled={reports.length === 0}
        >
          {allSelected ? "Limpar" : "Todos"}
        </Button>
      </div>

      {open && reports.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l border-border pl-3">
          {reports.map((r) => {
            const key = r.reportIdPB ?? r._id ?? r.name;
            const checked = r.reportIdPB ? selectedReports.has(r.reportIdPB) : false;
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors hover:bg-accent">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => r.reportIdPB && onToggle(r.reportIdPB)}
                  />
                  <span className="truncate capitalize">
                    {(r.name ?? r.reportIdPB ?? "—").toLocaleLowerCase()}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {open && reports.length === 0 && (
        <p className="ml-5 mt-1 px-2 py-1 text-xs text-muted-foreground">
          Sem relatórios.
        </p>
      )}
    </li>
  );
}
