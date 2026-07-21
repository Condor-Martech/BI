import { stopImpersonation } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await stopImpersonation();
  return Response.json(result);
}
