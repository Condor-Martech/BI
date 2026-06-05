import { notFound, redirect } from "next/navigation";

import { apiServer } from "@/lib/api/server";
import { ApiAuthError, ApiError } from "@/lib/api/types";
import { reportDetailSchema, type ReportDetail } from "@/lib/api/endpoints/reports";

import { ReportView } from "./_components/report-view";

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

  return <ReportView detail={detail} />;
}
