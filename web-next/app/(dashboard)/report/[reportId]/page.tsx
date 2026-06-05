import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { apiServer } from "@/lib/api/server";
import { ApiAuthError, ApiError } from "@/lib/api/types";
import { reportDetailSchema, type ReportDetail } from "@/lib/api/endpoints/reports";

import { ReportView } from "./_components/report-view";

// Só nos importa o flag aqui. Schema tolerante (passthrough): a resposta de
// GET /users ("me") tem shape diferente de /users/all (accountID pode vir null,
// group como objeto, etc.) e não queremos que isso derrube o parse.
const meChatIaSchema = z.object({ chatIaEnabled: z.boolean().optional() }).passthrough();

interface PageProps {
  params: Promise<{ reportId: string }>;
}

// Mongo ObjectId is 24 hex chars; Power BI reportId is a UUID v4 (36 chars w/ dashes).
// Validate loosely — accept either. Hard-block obvious garbage.
const REPORT_ID_RE = /^[a-zA-Z0-9-]{16,64}$/;

export default async function ReportPage({ params }: PageProps) {
  const { reportId } = await params;
  if (!REPORT_ID_RE.test(reportId)) notFound();

  let detail: ReportDetail;
  try {
    const raw = await apiServer<unknown>(`/reports/${encodeURIComponent(reportId)}`);
    detail = reportDetailSchema.parse(raw);
  } catch (err) {
    if (err instanceof ApiAuthError) redirect("/login");
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Flag de Análise com IA: fonte da verdade é o documento do usuário (sempre fresco).
  // Em caso de erro não-auth, escondemos o recurso (false) em vez de derrubar o relatório.
  let chatIaEnabled = false;
  try {
    const me = meChatIaSchema.parse(await apiServer<unknown>("/users"));
    chatIaEnabled = me.chatIaEnabled ?? false;
  } catch (err) {
    if (err instanceof ApiAuthError) redirect("/login");
    // qualquer outro erro: mantém o recurso oculto.
  }

  return <ReportView detail={detail} chatIaEnabled={chatIaEnabled} />;
}
