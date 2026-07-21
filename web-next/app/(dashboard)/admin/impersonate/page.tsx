import { notFound } from "next/navigation";
import { currentUserIsAllowedAdmin } from "@/lib/auth/admin";
import { UserSearch } from "./_components/user-search";

export const dynamic = "force-dynamic";

export default async function ImpersonatePage() {
  const allowed = await currentUserIsAllowedAdmin();
  if (!allowed) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Ver como outro usuário</h1>
        <p className="text-sm text-muted-foreground">
          Sua sessão será substituída pela do usuário selecionado por até 1 hora.
          Um banner permitirá voltar à sua sessão em qualquer momento.
        </p>
      </div>
      <UserSearch />
    </div>
  );
}
