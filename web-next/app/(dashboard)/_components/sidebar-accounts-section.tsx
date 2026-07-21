"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Building2, ChevronRight, FileBarChart2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { MeSidebarWorkspace } from "@/lib/api/endpoints/me-sidebar";
import { useMeSidebar } from "@/lib/hooks/me-sidebar";
import { durations, easings } from "@/lib/motion/transitions";
import { cn } from "@/lib/utils";

const OPEN_COOKIE = "bi_sidebar_open_accounts";

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function WorkspaceLink({ ws }: { ws: MeSidebarWorkspace }) {
  const pathname = usePathname();
  const href = `/workspaces/${encodeURIComponent(ws.pbWorkspaceId)}?name=${encodeURIComponent(ws.name)}`;
  const active = pathname === `/workspaces/${ws.pbWorkspaceId}`;
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <FileBarChart2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{toSentenceCase(ws.name)}</span>
      </Link>
    </li>
  );
}

interface Props {
  collapsed: boolean;
  defaultOpenAccountIds: string[];
}

const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

// Power BI a veces devuelve nombres con caracteres invisibles al inicio (NBSP, zero-width
// space/joiner/non-joiner, BOM) que rompen el orden alfabético. Los saco antes de comparar.
const INVISIBLE_LEADING = /^[\s ​‌‍﻿]+/u;

function sortKey(value: string): string {
  return value.normalize("NFKC").replace(INVISIBLE_LEADING, "");
}

function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => nameCollator.compare(sortKey(a.name), sortKey(b.name)));
}

export function SidebarAccountsSection({ collapsed, defaultOpenAccountIds }: Props) {
  const { data, isLoading } = useMeSidebar();
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpenAccountIds));

  if (collapsed) return null;

  function toggle(accountId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      document.cookie = `${OPEN_COOKIE}=${encodeURIComponent(Array.from(next).join(","))}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // USER recibe una única "cuenta" sintética con los workspaces ya deduplicados:
  // lo mostramos plano, sin el acordeón de cuenta (que solo aporta a privilegiados).
  const flat = !!data && data.length === 1;
  const sortedAccounts = data ? sortByName(data) : [];

  return (
    <div className="space-y-1 p-2" aria-label="Meus workspaces">
      <p className="px-2 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
        {flat ? "Meus workspaces" : "Minhas contas"}
      </p>

      {isLoading ? (
        <div className="space-y-1 px-1">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="px-2 text-xs text-sidebar-foreground/60">Nenhum workspace disponível</p>
      ) : flat ? (
        <ul className="space-y-0.5" aria-label="Workspaces">
          {sortedAccounts[0]!.workspaces.length === 0 ? (
            <li className="px-2 py-1 text-xs text-sidebar-foreground/50">Nenhum workspace</li>
          ) : (
            sortByName(sortedAccounts[0]!.workspaces).map((ws) => (
              <WorkspaceLink key={ws.id} ws={ws} />
            ))
          )}
        </ul>
      ) : (
        <ul className="space-y-0.5">
          {sortedAccounts.map((account) => {
            const isOpen = open.has(account.id);
            return (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => toggle(account.id)}
                  aria-expanded={isOpen}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform duration-150",
                      isOpen && "rotate-90",
                    )}
                  />
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate text-left uppercase">{account.name}</span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      key="workspaces-list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: durations.base, ease: easings.standard }}
                      style={{ overflow: "hidden" }}
                    >
                      <ul className="mt-0.5 space-y-0.5 pl-5" aria-label={`Workspaces de ${account.name}`}>
                        {account.workspaces.length === 0 ? (
                          <li className="px-2 py-1 text-xs text-sidebar-foreground/50">
                            Nenhum workspace
                          </li>
                        ) : (
                          sortByName(account.workspaces).map((ws) => (
                            <WorkspaceLink key={ws.id} ws={ws} />
                          ))
                        )}
                      </ul>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
