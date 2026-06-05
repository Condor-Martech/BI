"use client";

import { useState } from "react";
import { ChevronRight, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AnalysisChat } from "./analysis-chat";
import { ConversationList } from "./conversation-list";

interface AnalysisPanelProps {
  reportIdPB: string;
  reportName?: string;
  /** When provided, renders a collapse control in the header. */
  onCollapse?: () => void;
}

export function AnalysisPanel({ reportIdPB, onCollapse }: AnalysisPanelProps) {
  const [tab, setTab] = useState("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Bump to force a fresh <AnalysisChat> mount when switching/starting conversations.
  const [chatKey, setChatKey] = useState(0);

  function newConversation() {
    setConversationId(null);
    setChatKey((k) => k + 1);
    setTab("chat");
  }

  function openConversation(id: string) {
    setConversationId(id);
    setChatKey((k) => k + 1);
    setTab("chat");
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-3.5" />
        </div>
        <h2 className="flex-1 text-sm font-semibold">Análise com IA</h2>
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={onCollapse}
            aria-label="Recolher painel"
            title="Recolher painel"
          >
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="chat">Conversa</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
          {tab === "chat" && (
            <Button variant="ghost" size="sm" onClick={newConversation} className="gap-1.5">
              <Plus className="size-3.5" />
              Nova
            </Button>
          )}
        </div>

        <TabsContent value="chat" className="min-h-0 flex-1">
          <AnalysisChat
            key={chatKey}
            reportIdPB={reportIdPB}
            conversationId={conversationId}
            onConversationCreated={setConversationId}
          />
        </TabsContent>

        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList reportIdPB={reportIdPB} onOpen={openConversation} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
