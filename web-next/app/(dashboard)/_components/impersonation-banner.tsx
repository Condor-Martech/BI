import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/auth/impersonation";
import { decodeJwt } from "@/lib/auth/jwt";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { stopImpersonationAction } from "./impersonation-stop-action";

export async function ImpersonationBanner() {
  const store = await cookies();
  const admin = store.get(ADMIN_COOKIE);
  if (!admin) return null;

  const target = store.get(ACCESS_COOKIE);
  const decoded = target ? decodeJwt(target.value) : null;
  const name = (decoded?.name as string | undefined) ?? (decoded?.email as string | undefined) ?? "usuário";

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 bg-destructive px-4 py-2 text-destructive-foreground shadow-md">
      <p className="text-sm">
        Você está vendo como <strong>{name}</strong>
      </p>
      <form action={stopImpersonationAction}>
        <button type="submit" className="rounded bg-white/20 px-3 py-1 text-sm font-medium hover:bg-white/30">
          Voltar à minha sessão
        </button>
      </form>
    </div>
  );
}
