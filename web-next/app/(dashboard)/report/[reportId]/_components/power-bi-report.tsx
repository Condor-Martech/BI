"use client";

import { useEffect, useRef, useState } from "react";

import type * as pbi from "powerbi-client";

import { useReportDetail } from "@/lib/hooks/reports";
import type { ReportDetail } from "@/lib/api/endpoints/reports";

import { ReportError } from "./report-error";

interface PowerBIReportProps {
  reportId: string;
  /** Optional initial data hydrated from an RSC pre-fetch. */
  initialData?: ReportDetail;
}

/**
 * Client component that mounts a live Power BI report via the vanilla
 * powerbi-client SDK.
 *
 * The legacy backend's `GET /reports/:reportId` returns BOTH the embedUrl
 * (already filtered server-side for row-level security) AND a fresh Azure
 * access_token (refreshed transparently per request via RefreshToken.refresh).
 *
 * Token refresh: react-query refetches every 55 minutes; whenever the query
 * data changes we call `report.setAccessToken(fresh)` so the embed keeps
 * working without re-rendering the iframe.
 */
export function PowerBIReport({ reportId, initialData }: PowerBIReportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<pbi.Report | null>(null);
  const serviceRef = useRef<pbi.service.Service | null>(null);
  const lastTokenRef = useRef<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useReportDetail(reportId, initialData);

  // Mount/unmount the embed when data first arrives or reportId changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data) return;

    let cancelled = false;
    let cleanupService: pbi.service.Service | null = null;

    // Dynamic import keeps the powerbi-client module out of the SSR bundle —
    // it references `self` at module load and would crash server rendering.
    void import("powerbi-client").then((mod) => {
      if (cancelled) return;

      const service = new mod.service.Service(
        mod.factories.hpmFactory,
        mod.factories.wpmpFactory,
        mod.factories.routerFactory,
      );
      serviceRef.current = service;
      cleanupService = service;

      const config: pbi.IReportEmbedConfiguration = {
        type: "report",
        tokenType: mod.models.TokenType.Aad,
        accessToken: data.accountID.token,
        embedUrl: data.embedUrl,
        id: data.reportIdPB,
        settings: {
          filterPaneEnabled: false,
          navContentPaneEnabled: true,
        },
      };

      const embedded = service.embed(container, config) as pbi.Report;
      reportRef.current = embedded;
      lastTokenRef.current = data.accountID.token;

      embedded.on("error", (event) => {
        // Diagnóstico agresivo: el SDK a veces envía event.detail como una
        // instancia con getters, otras veces como plain object, y a veces
        // vacío. Serializamos TODO el objeto (props enumerables + del prototype)
        // en un snapshot inmutable para no depender del display del devtools.
        const dump = (obj: unknown): Record<string, unknown> | unknown => {
          if (!obj || typeof obj !== "object") return obj;
          const out: Record<string, unknown> = {};
          for (
            let proto: object | null = obj as object;
            proto && proto !== Object.prototype;
            proto = Object.getPrototypeOf(proto)
          ) {
            for (const key of Object.getOwnPropertyNames(proto)) {
              if (key === "constructor") continue;
              try {
                const value = (obj as Record<string, unknown>)[key];
                if (typeof value !== "function" && !(key in out)) {
                  out[key] = value;
                }
              } catch {
                out[key] = "<throw on access>";
              }
            }
          }
          return out;
        };

        const detail = event?.detail as
          | {
              message?: string;
              detailedMessage?: string;
              errorCode?: string;
              level?: unknown;
              technicalDetails?: unknown;
            }
          | undefined;

        // Snapshot ANTES de cualquier otra lectura — evita que un getter que
        // muta o que devuelve undefined en la segunda invocación nos engañe.
        const snapshot = dump(detail);
        const message = detail?.message;
        const errorCode = detail?.errorCode;
        const hasSignal = Boolean(message || errorCode);

        // Log crudo con console.dir muestra el objeto real (getters incluidos)
        // sin depender de la serialización que hace console.log.
        console.groupCollapsed(
          `[PowerBIReport] SDK error event (hasSignal=${hasSignal}, code=${errorCode ?? "?"})`,
        );
        console.log("event:", event);
        console.log("event.detail (dir):");
        console.dir(detail);
        console.log("snapshot:", snapshot);
        console.log("snapshot JSON:", (() => {
          try { return JSON.stringify(snapshot, null, 2); }
          catch (e) { return `<unserializable: ${(e as Error).message}>`; }
        })());
        console.groupEnd();

        // TokenExpired: el token de embed venció. Recuperable — el backend
        // refresca on-demand vía RefreshToken.refresh(). Forzamos refetch del
        // hook para pedir un nuevo GET /reports/:id, y el useEffect de
        // setAccessToken lo aplicará al iframe sin re-montar.
        if (errorCode === "TokenExpired") {
          console.warn("[PowerBIReport] TokenExpired — solicitando token novo");
          setEmbedError("Renovando sessão do Power BI...");
          void refetch().then(() => {
            setEmbedError(null);
          });
          return;
        }

        if (hasSignal) {
          setEmbedError(message ?? `Power BI: ${errorCode}`);
        }
      });
    });

    return () => {
      cancelled = true;
      if (cleanupService) {
        try {
          cleanupService.reset(container);
        } catch {
          // container may already be detached
        }
      }
      reportRef.current = null;
      serviceRef.current = null;
      lastTokenRef.current = null;
    };
    // We only want to re-mount when the reportId changes. Token changes are
    // applied via setAccessToken in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, Boolean(data)]);

  // Apply token refreshes without re-mounting the iframe.
  useEffect(() => {
    const report = reportRef.current;
    if (!report || !data) return;
    if (data.accountID.token === lastTokenRef.current) return;
    lastTokenRef.current = data.accountID.token;
    report.setAccessToken(data.accountID.token).catch((err) => {
      console.error("[PowerBIReport] setAccessToken failed:", err);
    });
  }, [data?.accountID.token]);

  if (isPending) {
    return (
      <div
        className="h-full animate-pulse rounded-md border border-border bg-muted/40"
        aria-busy="true"
        aria-label="Carregando relatório"
      />
    );
  }

  if (error) {
    return <ReportError message={error.message} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
      {embedError && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-sm text-destructive"
        >
          <span className="font-medium">{embedError}</span>
        </div>
      )}
      <div ref={containerRef} className="flex-1" aria-label="Power BI report" />
      <div className="flex items-center justify-end border-t border-border bg-muted/40 px-4 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">Powered by Plataforma BI</span>
      </div>
    </div>
  );
}
