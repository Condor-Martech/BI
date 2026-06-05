"use client";

import { AlertTriangle, CheckCircle2, Database, Lightbulb, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DaxQuery } from "@/lib/api/endpoints/analysis";

/**
 * Shape consumed by the renderer — satisfied by both `AnalysisResponse` (fresh POST)
 * and `AnalysisDetail` (historical GET /:id, normalized via `daxRuns → daxQueries`).
 */
export interface AnalysisResultData {
  summary: string;
  keyFindings: string[];
  anomalies: string[];
  recommendations: string[];
  daxQueries: DaxQuery[];
  status?: "success" | "partial" | "failed";
  cached?: boolean;
  generatedAt?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    model?: string;
  };
}

export function AnalysisResult({ data }: { data: AnalysisResultData }) {
  const hasAnomalies = data.anomalies.length > 0;
  const hasFindings = data.keyFindings.length > 0;
  const hasRecs = data.recommendations.length > 0;
  const hasDax = data.daxQueries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Status / cache banner */}
      <div className="flex flex-wrap items-center gap-2">
        {data.status === "partial" && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            Análise parcial
          </Badge>
        )}
        {data.cached && (
          <Badge variant="secondary" className="gap-1">
            <Database className="size-3" />
            Cache
          </Badge>
        )}
        {data.generatedAt && (
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(data.generatedAt)}
          </span>
        )}
      </div>

      {/* Summary — destacado */}
      {data.summary && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Sparkles className="size-4" />
            <h3 className="text-sm font-semibold">Resumo</h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{data.summary}</p>
        </section>
      )}

      {/* Key findings */}
      {hasFindings && (
        <Section icon={<CheckCircle2 className="size-4" />} title="Principais achados">
          <ul className="flex flex-col gap-2">
            {data.keyFindings.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Anomalies — resaltadas */}
      {hasAnomalies && (
        <section className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-warning">
            <AlertTriangle className="size-4" />
            <h3 className="text-sm font-semibold">Anomalias detectadas</h3>
          </div>
          <ul className="flex flex-col gap-2">
            {data.anomalies.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommendations */}
      {hasRecs && (
        <Section icon={<Lightbulb className="size-4" />} title="Recomendações">
          <ul className="flex flex-col gap-2">
            {data.recommendations.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* DAX queries — trazabilidade (colapsable) */}
      {hasDax && (
        <details className="group rounded-lg border border-border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2">
              <Database className="size-3.5" />
              Consultas DAX ({data.daxQueries.length})
            </span>
            <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-border p-4">
            {data.daxQueries.map((q, i) => (
              <DaxBlock key={i} query={q} />
            ))}
          </div>
        </details>
      )}

      {/* Footer — usage */}
      {data.usage && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
          {data.usage.model && <span className="font-mono">{data.usage.model}</span>}
          {typeof data.usage.totalTokens === "number" && data.usage.totalTokens > 0 && (
            <span>{data.usage.totalTokens.toLocaleString("pt-BR")} tokens</span>
          )}
          {typeof data.usage.estimatedCostUsd === "number" && data.usage.estimatedCostUsd > 0 && (
            <span>~US$ {data.usage.estimatedCostUsd.toFixed(4)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function DaxBlock({ query }: { query: DaxQuery }) {
  const rows = query.sampleRows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];

  return (
    <div className="flex flex-col gap-2">
      {query.purpose && <p className="text-xs font-medium text-foreground">{query.purpose}</p>}
      {query.query && (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {query.query}
        </pre>
      )}
      {query.error ? (
        <p className="text-xs text-destructive">{query.error}</p>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{query.rowCount} linha(s)</span>
          {query.truncated && (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              truncado
            </Badge>
          )}
        </div>
      )}
      {columns.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="h-7 px-2 text-[10px] whitespace-nowrap">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 10).map((row, ri) => (
                <TableRow key={ri}>
                  {columns.map((c) => (
                    <TableCell key={c} className="px-2 py-1 text-[11px] whitespace-nowrap">
                      {formatCell(row?.[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
