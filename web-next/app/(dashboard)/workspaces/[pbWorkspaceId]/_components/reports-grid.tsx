"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { FileBarChart2, MoreVertical, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/types";
import { useAllReports, useHideReport, useUnhideReport } from "@/lib/hooks/reports";
import { cn } from "@/lib/utils";

interface MeReport {
  id: string;
  pbReportId: string;
  name: string;
  hiddenByAdmin?: boolean;
  hiddenAt?: string | Date | null;
  hiddenBy?: string | null;
}

interface Props {
  /** SSR-hydrated list from `/me/reports?pbWorkspaceId=X`. Always excludes hidden info. */
  reports: MeReport[];
  pbWorkspaceId: string;
  /** True when the current user is `manager` or `admin` (from the JWT). */
  isManager: boolean;
}

/** URL param used to persist the "show hidden" toggle across refreshes. */
const SHOW_HIDDEN_PARAM = "showHidden";

/**
 * Grid of report cards for a workspace.
 *
 * Managers get: soft-hide/unhide kebab menu per card, `hiddenByAdmin` badge on
 * hidden cards, and a `Mostrar ocultos` toggle in the header (persisted as
 * `?showHidden=true` in the URL). Managers fetch client-side via `useAllReports`
 * (which supports `?includeHidden=true`), filtered to this workspace's
 * `groupIdPB` — the SSR-hydrated `/me/reports` payload doesn't carry the hide
 * fields, so the SSR list is only used as the initial fallback while the
 * client query is fetching.
 *
 * Non-managers just get the SSR list — no toggle, no menu, no badges.
 */
export function ReportsGrid({ reports, pbWorkspaceId, isManager }: Props) {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const showHidden =
    isManager && searchParams.get(SHOW_HIDDEN_PARAM) === "true";

  const toggleShowHidden = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(SHOW_HIDDEN_PARAM, "true");
      else params.delete(SHOW_HIDDEN_PARAM);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Managers get the full inventory (with hiddenByAdmin/hiddenAt/hiddenBy).
  // We ask the backend for the exact slice we want to render (`includeHidden`
  // reflects the toggle) and narrow it to this workspace's groupIdPB.
  const allReports = useAllReports(showHidden, { enabled: isManager });
  const managerReports = useMemo<MeReport[]>(() => {
    if (!isManager || !allReports.data) return [];
    return allReports.data
      .filter((r) => r.groupIdPB === pbWorkspaceId && r.reportIdPB && r._id)
      .map((r) => ({
        id: r._id!,
        pbReportId: r.reportIdPB!,
        name: r.name ?? "Relatório sem nome",
        hiddenByAdmin: r.hiddenByAdmin ?? false,
        hiddenAt:
          r.hiddenAt instanceof Date ? r.hiddenAt.toISOString() : r.hiddenAt ?? null,
        hiddenBy: r.hiddenBy ?? null,
      }));
  }, [allReports.data, isManager, pbWorkspaceId]);

  // Non-managers see the SSR list as-is; managers switch to the client list as
  // soon as it resolves (SSR list is the initial fallback to avoid a blank grid).
  const source: MeReport[] =
    isManager && allReports.data ? managerReports : reports;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (r) => r.name.toLowerCase().includes(q) || r.pbReportId.toLowerCase().includes(q),
    );
  }, [search, source]);

  const hasFilter = search.trim().length > 0;
  const totalCount = source.length;

  const [confirmHide, setConfirmHide] = useState<MeReport | null>(null);
  const hideMutation = useHideReport();
  const unhideMutation = useUnhideReport();

  const runMutation = useCallback(
    async (action: "hide" | "unhide", report: MeReport) => {
      try {
        if (action === "hide") await hideMutation.mutateAsync(report.id);
        else await unhideMutation.mutateAsync(report.id);
        toast.success(
          action === "hide"
            ? `Relatório "${report.name}" ocultado.`
            : `Relatório "${report.name}" restaurado.`,
        );
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 403
              ? "Você não tem permissão."
              : err.status === 404
                ? "Relatório não encontrado."
                : err.message
            : "Erro ao atualizar o relatório.";
        toast.error(message);
      }
    },
    [hideMutation, unhideMutation],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar relatório por nome ou ID…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-3">
          {isManager ? (
            <div className="flex items-center gap-2">
              <Label
                htmlFor="show-hidden-toggle"
                className="cursor-pointer text-xs text-muted-foreground"
              >
                Mostrar ocultos
              </Label>
              <Toggle
                id="show-hidden-toggle"
                size="sm"
                variant="outline"
                pressed={showHidden}
                onPressedChange={toggleShowHidden}
                aria-label="Mostrar relatórios ocultos"
              >
                {showHidden ? "Sim" : "Não"}
              </Toggle>
            </div>
          ) : null}
          <Badge variant="secondary" className="font-mono">
            {hasFilter ? `${filtered.length} / ${totalCount}` : `${totalCount}`}{" "}
            relatórios
          </Badge>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center justify-center gap-2 rounded-md border py-16 text-sm text-muted-foreground">
          <FileBarChart2 className="size-5" />
          {source.length === 0
            ? "Nenhum relatório disponível neste workspace."
            : "Sem resultados para a busca."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              isManager={isManager}
              onHideRequest={() => setConfirmHide(r)}
              onUnhide={() => runMutation("unhide", r)}
              busy={
                (hideMutation.isPending && hideMutation.variables === r.id) ||
                (unhideMutation.isPending && unhideMutation.variables === r.id)
              }
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={confirmHide !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmHide(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ocultar relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              O relatório{" "}
              <span className="font-medium text-foreground">
                &ldquo;{confirmHide?.name}&rdquo;
              </span>{" "}
              deixará de aparecer para todos os usuários. Você pode restaurá-lo
              depois clicando em &ldquo;Mostrar ocultos&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!confirmHide) return;
                const target = confirmHide;
                setConfirmHide(null);
                void runMutation("hide", target);
              }}
            >
              Ocultar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ReportCardProps {
  report: MeReport;
  isManager: boolean;
  onHideRequest: () => void;
  onUnhide: () => void;
  busy: boolean;
}

/**
 * A single report card. The whole card links to `/report/:pbReportId`; the
 * kebab menu (manager-only) is rendered as a sibling on top so its clicks
 * don't bubble into the Link.
 */
function ReportCard({
  report,
  isManager,
  onHideRequest,
  onUnhide,
  busy,
}: ReportCardProps) {
  const hidden = report.hiddenByAdmin === true;

  return (
    <div className="relative">
      <Link href={`/report/${report.pbReportId}`} className="block">
        <Card
          className={cn(
            "transition-colors hover:bg-accent",
            hidden && "opacity-60",
          )}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2 pr-6">
              <CardTitle className="line-clamp-2 text-sm font-medium">
                {report.name}
              </CardTitle>
              {hidden ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="shrink-0">
                      Oculto
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>
                      Ocultado
                      {report.hiddenBy ? ` por ${report.hiddenBy}` : ""}
                      {report.hiddenAt ? ` em ${formatHiddenAt(report.hiddenAt)}` : ""}
                    </span>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <p className="line-clamp-1 font-mono text-xs text-muted-foreground">
              {report.pbReportId}
            </p>
          </CardContent>
        </Card>
      </Link>

      {isManager ? (
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Opções do relatório"
                disabled={busy}
                onClick={(e) => {
                  // Prevent the parent <Link> from navigating when the menu opens.
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {hidden ? (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    onUnhide();
                  }}
                >
                  Restaurar relatório
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    onHideRequest();
                  }}
                >
                  Ocultar relatório
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function formatHiddenAt(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
