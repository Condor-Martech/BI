"use client";

import { Database, Sparkles } from "lucide-react";

import type { ChartSpec, DaxQuery } from "@/lib/api/endpoints/analysis";

import { AnalysisChart } from "./analysis-chart";
import { DaxBlock } from "./analysis-result";
import { Markdown } from "./markdown";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  charts?: ChartSpec[];
  daxQueries?: DaxQuery[];
  /** Optimistic/pending assistant turn — render a "typing" placeholder. */
  pending?: boolean;
}

export function AnalysisMessage({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{turn.content}</p>
        </div>
      </div>
    );
  }

  const charts = turn.charts ?? [];
  const dax = turn.daxQueries ?? [];

  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {turn.pending ? (
          <TypingDots />
        ) : (
          <>
            {turn.content && <Markdown>{turn.content}</Markdown>}

            {charts.map((spec, i) => (
              <AnalysisChart key={i} spec={spec} />
            ))}

            {dax.length > 0 && (
              <details className="group mt-2 rounded-lg border border-border bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Database className="size-3.5" />
                  Consultas DAX ({dax.length})
                  <span className="ml-auto transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  {dax.map((q, i) => (
                    <DaxBlock key={i} query={q} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Gerando resposta">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
    </div>
  );
}
