import { proxyToApi } from "@/lib/api/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ path?: string[] }>;
}

async function handle(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const upstreamPath = "/users/admin/allowlist" + (path.length > 0 ? "/" + path.join("/") : "");
  return proxyToApi(req, { upstreamPath });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
