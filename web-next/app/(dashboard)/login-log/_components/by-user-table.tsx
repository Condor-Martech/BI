"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/patterns/data-table/data-table";
import { roleLabel } from "@/lib/auth/roles";
import { type AggregatedUser } from "./types";

interface ByUserTableProps {
  /** Já pré-agregado pelo backend (`/login-log/resumo-usuarios`). */
  data: AggregatedUser[];
  loading?: boolean;
  emptyState?: string;
  onSelectUser: (userKey: string) => void;
}

export function ByUserTable({ data, loading, emptyState, onSelectUser }: ByUserTableProps) {
  const sorted = useMemo<AggregatedUser[]>(
    () => [...data].sort((a, b) => b.lastAccessMs - a.lastAccessMs),
    [data],
  );

  const columns = useMemo<ColumnDef<AggregatedUser>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Usuario",
        cell: ({ row }) => (
          <span className={row.original.isDeleted ? "text-muted-foreground italic" : "font-medium"}>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role",
        header: "Rol",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.role === "—" ? "—" : roleLabel(row.original.role)}
          </Badge>
        ),
      },
      {
        accessorKey: "count",
        header: "Accesos",
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-mono">
            {row.original.count}
          </Badge>
        ),
      },
      {
        accessorKey: "lastAccessMs",
        header: "Último acceso",
        cell: ({ row }) => {
          const r = row.original;
          const label =
            r.count === 0
              ? "Nunca"
              : r.lastAccessMs > 0
                ? new Date(r.lastAccessMs).toLocaleString("pt-BR")
                : r.lastAccessRaw || "—";
          return <span className="font-mono text-xs text-muted-foreground">{label}</span>;
        },
      },
      {
        id: "actions",
        header: "",
        cell: () => <ChevronRight className="size-3.5 text-muted-foreground" />,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={sorted}
      loading={loading}
      density="cozy"
      pageSize={25}
      emptyState={emptyState}
      onRowClick={(row) => onSelectUser(row.key)}
    />
  );
}
