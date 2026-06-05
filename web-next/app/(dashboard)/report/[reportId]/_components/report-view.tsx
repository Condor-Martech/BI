"use client";

import { useState } from "react";
import { ChartBar, ChevronLeft, Database, Folder, Sparkles } from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ReportDetail } from "@/lib/api/endpoints/reports";

import { FavouriteButton } from "./favourite-button";
import { PowerBIReport } from "./power-bi-report";
import { AnalysisPanel } from "./analysis-panel";

/**
 * Client half of the report page. Owns the resizable layout (Power BI embed +
 * AI analysis panel) plus the panel's collapse-to-rail behavior, mirroring the
 * dashboard sidebar. Collapsing only changes the embed's width — the iframe is
 * never re-mounted, so its live token/state survive.
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
        {!chatIaEnabled ? (
          <div className="min-w-0 flex-1 p-6">
            <PowerBIReport reportId={detail.reportIdPB} initialData={detail} />
          </div>
        ) : collapsed ? (
          <>
            <div className="min-w-0 flex-1 p-6">
              <PowerBIReport reportId={detail.reportIdPB} initialData={detail} />
            </div>
            <AnalysisRail onExpand={() => setCollapsed(false)} />
          </>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel id="report" defaultSize="65%" minSize="30%" className="p-6">
              <PowerBIReport reportId={detail.reportIdPB} initialData={detail} />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="analysis" defaultSize="35%" minSize="24%" maxSize="55%">
              <AnalysisPanel
                reportIdPB={detail.reportIdPB}
                reportName={detail.name}
                onCollapse={() => setCollapsed(true)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
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
