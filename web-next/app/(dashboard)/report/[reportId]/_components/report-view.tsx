"use client";

import { useEffect, useState } from "react";
import { useOpenPanel } from "@openpanel/nextjs";
import { ChartBar, ChevronLeft, Database, Folder, Sparkles } from "lucide-react";

import type { ReportDetail } from "@/lib/api/endpoints/reports";

import { FavouriteButton } from "./favourite-button";
import { PowerBIReport } from "./power-bi-report";
import { AnalysisPanel } from "./analysis-panel";

/**
 * Client half of the report page. Owns the report + AI analysis layout plus the
 * panel's collapse-to-rail behavior, mirroring the dashboard sidebar.
 *
 * CRITICAL: the <PowerBIReport> is rendered exactly ONCE, as the first flex
 * child, in a DOM position that never changes across the collapsed/expanded
 * toggle. The analysis UI (rail or panel) is only ever a sibling. Moving the
 * Power BI iframe in the DOM would force the browser to reload Power BI's
 * sandboxed frames (`cvSandboxPack.cshtml`), breaking their cross-frame
 * postMessage handshake — which surfaces in production as
 * "Unsafe attempt to load URL ... Domains, protocols and ports must match".
 * That is why this layout uses a fixed-width sibling instead of a
 * ResizablePanelGroup: swapping the report between branches re-parented the
 * iframe and triggered that error.
 */
export function ReportView({
  detail,
  chatIaEnabled,
}: {
  detail: ReportDetail;
  chatIaEnabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);

  const accountName = detail.accountID.nameAccount ?? detail.accountID.email ?? "Cuenta";

  // OpenPanel: cuenta accesos por reporte. Agrupá por `reportName`/`reportId` en
  // el dashboard de OpenPanel para ver los más accesados. Una vez por reporte.
  const { track } = useOpenPanel();
  useEffect(() => {
    track("report_viewed", {
      reportId: detail.reportIdPB,
      reportName: detail.name ?? "sin nombre",
      account: accountName,
    });
  }, [track, detail.reportIdPB, detail.name, accountName]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-col gap-3 border-b border-border bg-background px-6 py-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Database className="size-3.5" />
          <span>{accountName}</span>
          {detail.groupIdPB && (
            <>
              <span>/</span>
              <Folder className="size-3.5" />
              <span className="font-mono text-[11px]">{detail.groupIdPB}</span>
            </>
          )}
          <span>/</span>
          <span className="text-foreground">{detail.name ?? "Relatório"}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ChartBar className="size-3" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold leading-tight">
                {detail.name ?? "Relatório sem nome"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FavouriteButton reportIdPB={detail.reportIdPB} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-muted/30">
        {/* Stable embed slot — never moves, never re-mounts on toggle. */}
        <div className="min-w-0 flex-1 p-6">
          <PowerBIReport reportId={detail.reportIdPB} initialData={detail} />
        </div>

        {chatIaEnabled &&
          (collapsed ? (
            <AnalysisRail onExpand={() => setCollapsed(false)} />
          ) : (
            <aside className="flex w-[420px] shrink-0 flex-col border-l border-border">
              <AnalysisPanel
                reportIdPB={detail.reportIdPB}
                reportName={detail.name}
                onCollapse={() => setCollapsed(true)}
              />
            </aside>
          ))}
      </div>
    </div>
  );
}

/** Thin rail shown when the analysis panel is collapsed — mirrors the menu sidebar. */
function AnalysisRail({ onExpand }: { onExpand: () => void }) {
  return (
    <aside className="relative flex w-11 shrink-0 flex-col items-center gap-3 border-l border-border bg-background py-3">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Sparkles className="size-3.5" />
      </div>
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expandir painel de análise"
        title="Análise com IA"
        className="flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="mt-1 text-[10px] font-medium tracking-wider text-muted-foreground [writing-mode:vertical-rl]">
        ANÁLISE IA
      </span>
    </aside>
  );
}
