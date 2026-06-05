"use client";

import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Search, Trash2, UserPen, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from "@/components/patterns/data-table/data-table";
import { useDeleteUser, useUsers } from "@/lib/hooks/users";
import { ROLES, type UserListItem } from "@/lib/api/endpoints/users";
import { roleLabel } from "@/lib/auth/roles";

import { DeleteConfirm } from "./_components/delete-confirm";
import { UserFormDialog } from "./_components/user-form-dialog";

type RoleFilter = "all" | (typeof ROLES)[number];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

const DATE_TIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

function formatLastLogin(value: UserListItem["lastLogin"]): {
  display: string;
  absolute: string | null;
} {
  if (!value) return { display: "Nunca", absolute: null };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { display: "—", absolute: null };

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const display = sameDay
    ? `Hoje ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : DATE_TIME_FMT.format(date);

  return { display, absolute: DATE_FMT.format(date) };
}

/**
 * Extrai os e-mails das contas (Power BI) vinculadas ao usuário. `accountID` pode
 * vir como array de objetos populados (lista MANAGER) ou de strings (IDs crus, caso
 * não populado) — só objetos com email entram.
 */
function accountEmails(accountID: UserListItem["accountID"]): string[] {
  if (!accountID || accountID.length === 0) return [];
  return accountID
    .map((a) => (typeof a === "string" ? null : a.email ?? null))
    .filter((e): e is string => Boolean(e));
}

/** Converts YYYY-MM-DD (local) to an ISO that fits the requested range edge. */
function toIso(value: string, edge: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (edge === "end") {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export function UsersPageClient() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | undefined>(undefined);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [lastLoginFrom, setLastLoginFrom] = useState("");
  const [lastLoginTo, setLastLoginTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");

  const debouncedSearch = useDebounced(search.trim(), 300);

  const queryParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      role: roleFilter !== "all" ? roleFilter : undefined,
      lastLoginFrom: toIso(lastLoginFrom, "start"),
      lastLoginTo: toIso(lastLoginTo, "end"),
    }),
    [debouncedSearch, roleFilter, lastLoginFrom, lastLoginTo],
  );

  const { data: users = [], isPending, error } = useUsers(queryParams);
  const del = useDeleteUser();

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(u: UserListItem) {
    setEditing(u);
    setFormOpen(true);
  }
  function confirmDelete(u: UserListItem) {
    if (!u._id) return;
    del.mutate(u._id, {
      onSuccess: () => {
        toast.success("Usuário excluído.");
        setDeleteTarget(undefined);
      },
      onError: (err) => toast.error((err as Error).message ?? "Não foi possível excluir."),
    });
  }

  const hasDateRange = Boolean(lastLoginFrom || lastLoginTo);

  // Opções do select de contas: e-mails únicos das contas presentes nos usuários
  // carregados. Derivadas de `users` (ANTES do filtro client-side de conta) —
  // senão a lista colapsaria para a única opção já selecionada.
  const accountOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      for (const email of accountEmails(u.accountID)) set.add(email);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  // Filtro client-side por e-mail da conta: o usuário entra se ALGUMA de suas
  // contas casar com o e-mail selecionado. (Server-side exigiria $lookup/aggregate,
  // pois o e-mail vive na coleção `accounts`, não no documento do usuário.)
  const filteredUsers = useMemo(() => {
    if (accountFilter === "all") return users;
    return users.filter((u) => accountEmails(u.accountID).includes(accountFilter));
  }, [users, accountFilter]);

  const columns = useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "email",
        header: "E-mail",
        cell: ({ row }) => {
          const email = row.original.email;
          if (!email) return <span className="text-muted-foreground">—</span>;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-[220px] truncate text-muted-foreground">
                  {email}
                </span>
              </TooltipTrigger>
              <TooltipContent>{email}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "accountEmail",
        // Ordena pelo primeiro e-mail de conta (a célula mostra "primeiro +N").
        accessorFn: (row) => accountEmails(row.accountID)[0] ?? "",
        sortingFn: "text",
        header: "E-mail da conta",
        cell: ({ row }) => {
          const emails = accountEmails(row.original.accountID);
          if (emails.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          const [first, ...rest] = emails;
          return (
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block max-w-[200px] truncate text-muted-foreground">
                    {first}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{first}</TooltipContent>
              </Tooltip>
              {rest.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs">
                      +{rest.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{rest.join(", ")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Função",
        cell: ({ row }) => (
          <Badge variant="outline">{roleLabel(row.original.role)}</Badge>
        ),
      },
      {
        accessorKey: "lastLogin",
        header: "Último login",
        cell: ({ row }) => {
          const { display, absolute } = formatLastLogin(row.original.lastLogin);
          if (!absolute) {
            return <span className="text-muted-foreground text-xs">{display}</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{display}</span>
              </TooltipTrigger>
              <TooltipContent>{absolute}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "__actions",
        enableSorting: false,
        size: 48,
        // Coluna fixada à direita: sempre visível mesmo se a tabela rolar na horizontal.
        // bg sólido para ocluir o conteúdo que passa por baixo; group-* espelha o hover/seleção
        // da linha (no-op no cabeçalho, cuja linha não é `group`).
        meta: {
          className:
            "sticky right-0 z-10 border-l border-border bg-background group-hover:bg-muted/50 group-data-[state=selected]:bg-muted",
        },
        header: () => null,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEdit(u)}>
                  <UserPen className="size-3.5" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteTarget(u)}
                >
                  <Trash2 className="size-3.5" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Gestão de usuários com acesso à plataforma. Restrito a MANAGER.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="size-3.5" />
          Criar usuário
        </Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, e-mail ou ISLV…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {accountOptions.length > 0 && (
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger size="sm" className="h-8 w-full text-xs sm:w-56">
                <SelectValue placeholder="Filtrar por conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {accountOptions.map((email) => (
                  <SelectItem key={email} value={email}>
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Login de</span>
            <Input
              type="date"
              value={lastLoginFrom}
              max={lastLoginTo || undefined}
              onChange={(e) => setLastLoginFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>até</span>
            <Input
              type="date"
              value={lastLoginTo}
              min={lastLoginFrom || undefined}
              onChange={(e) => setLastLoginTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
          </label>
          {hasDateRange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setLastLoginFrom("");
                setLastLoginTo("");
              }}
            >
              <X className="size-3" />
              Limpar datas
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="border-border bg-card rounded-md border p-6 text-center text-sm text-destructive">
          Erro ao carregar usuários: {(error as Error).message}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredUsers}
          loading={isPending}
          density="cozy"
          pageSize={25}
          emptyState={
            debouncedSearch || roleFilter !== "all" || hasDateRange || accountFilter !== "all"
              ? "Sem resultados para os filtros aplicados."
              : "Ainda não há usuários."
          }
        />
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />

      <DeleteConfirm
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(undefined);
        }}
        title="Excluir este usuário?"
        description={`${deleteTarget?.name ?? "O usuário"} será excluído permanentemente. Não é possível desfazer.`}
        onConfirm={() => deleteTarget && confirmDelete(deleteTarget)}
        isPending={del.isPending}
      />
    </div>
  );
}
