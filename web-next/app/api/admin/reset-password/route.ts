import { proxyToApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxyToApi(req, { upstreamPath: "/users/admin/reset-password" });
}
