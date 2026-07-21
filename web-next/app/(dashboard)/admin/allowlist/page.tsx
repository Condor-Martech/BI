import { notFound } from "next/navigation";
import { currentUserIsSuperAdmin } from "@/lib/auth/admin";
import { AllowlistTable } from "./_components/allowlist-table";

export const dynamic = "force-dynamic";

export default async function AllowlistPage() {
  const isSuper = await currentUserIsSuperAdmin();
  if (!isSuper) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Gestão de acessos admin</h1>
        <p className="text-sm text-muted-foreground">
          Usuários que podem usar reset de senha e impersonation. Apenas você (super admin) pode alterar esta lista.
        </p>
      </div>
      <AllowlistTable />
    </div>
  );
}
