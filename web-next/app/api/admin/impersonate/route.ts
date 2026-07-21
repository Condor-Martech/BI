import { proxyToApi } from "@/lib/api/proxy";
import { beginImpersonation } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const upstream = await proxyToApi(req.clone(), {
    upstreamPath: "/users/admin/impersonate",
  });

  if (!upstream.ok) {
    return upstream;
  }

  const body = (await upstream.json()) as {
    token: string;
    exp: number;
    target: { email: string; name: string; role: string };
  };
  await beginImpersonation(body.token);

  return Response.json({ target: body.target });
}
