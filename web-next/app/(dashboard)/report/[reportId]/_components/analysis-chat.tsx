"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalysisChat, useConversation } from "@/lib/hooks/analysis";
import { AnalysisLanguage } from "@/lib/api/endpoints/analysis";

import { AnalysisMessage, type ChatTurn } from "./analysis-message";

interface AnalysisChatProps {
  reportIdPB: string;
  /** When opening from history; null/undefined = fresh conversation. */
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
}

const SUGGESTIONS = [
  "Faça uma análise geral deste relatório",
  "Quais as principais tendências?",
  "Há alguma anomalia nos dados?",
];

export function AnalysisChat({ reportIdPB, conversationId, onConversationCreated }: AnalysisChatProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [convId, setConvId] = useState<string | null>(conversationId ?? null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const chat = useAnalysisChat(reportIdPB);
  // Hydrate from an existing conversation (only when opened from history).
  const { data: loaded, isPending: loadingConversation } = useConversation(conversationId ?? null);

  // Hydrate once from server data via render-time state sync (the React-sanctioned
  // alternative to calling setState inside an effect). The id guard prevents loops.
  if (loaded && loaded._id !== hydratedId) {
    setHydratedId(loaded._id);
    setConvId(loaded._id);
    setMessages(
      loaded.messages.map((m) => ({
        role: m.role,
        content: m.content,
        charts: m.charts,
        daxQueries: m.daxRuns,
      })),
    );
  }

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, chat.isPending]);

  function send(text: string) {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    chat.mutate(
      { conversationId: convId ?? undefined, message, language: AnalysisLanguage.PT_BR },
      {
        onSuccess: (res) => {
          if (!convId) {
            setConvId(res.conversationId);
            onConversationCreated?.(res.conversationId);
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: res.reply,
              charts: res.charts,
              daxQueries: res.daxQueries,
            },
          ]);
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Não foi possível responder: ${err.message}`,
            },
          ]);
        },
      },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0 && !chat.isPending;
  const showLoadingSkeleton = Boolean(conversationId) && loadingConversation && messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {showLoadingSkeleton ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : isEmpty ? (
          <EmptyChat onPick={send} />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((turn, i) => (
              <AnalysisMessage key={i} turn={turn} />
            ))}
            {chat.isPending && <AnalysisMessage turn={{ role: "assistant", content: "", pending: true }} />}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte algo sobre o relatório…"
            rows={1}
            disabled={chat.isPending}
            className="max-h-32 min-h-9 resize-none"
          />
          <Button
            size="icon"
            onClick={() => send(input)}
            disabled={chat.isPending || !input.trim()}
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          As respostas podem levar até ~1 minuto. Enter envia, Shift+Enter quebra linha.
        </p>
      </div>
    </div>
  );
}

function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-medium text-foreground">Converse com seus dados</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pergunte sobre o relatório e a IA consulta o dataset (DAX) para responder com números reais
          e gráficos.
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
