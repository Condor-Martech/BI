import { notFound } from "next/navigation";
import { currentUserIsAllowedAdmin } from "@/lib/auth/admin";
import { ResetForm } from "./_components/reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const allowed = await currentUserIsAllowedAdmin();
  if (!allowed) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Reset de senha</h1>
        <p className="text-sm text-muted-foreground">
          Gera uma nova senha aleatória para o usuário. A senha aparece uma única vez.
        </p>
      </div>
      <ResetForm />
    </div>
  );
}
