import { redirect } from "next/navigation";
import { FileBarChart2, LayoutGrid, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiServer } from "@/lib/api/server";
import { ApiAuthError } from "@/lib/api/types";
import { roleLabel } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

import { FavoriteCard } from "./_components/favorite-card";
import { StatCard } from "./_components/stat-card";

interface Overview {
  assignedReports: number;
  workspaces: number;
}

interface FavoriteWithReport {
  _id?: string;
  userID?: string;
  reportIdPB?: string;
  order?: number;
  report?: {
    reportIdPB?: string;
    name?: string;
    embedUrl?: string;
    groupIdPB?: string;
    account?: { nameAccount?: string; email?: string } | null;
  };
}

// Fallback cuando el JWT no trae `name` (tokens emitidos antes de que el backend
// lo incluyera). Deriva del prefix del email (`francisco.araujo` → `Francisco
// Araujo`): split por `.`/`_`/`-`, capitaliza cada palabra. Pierde acentos, pero
// evita mostrar `francisco.araujo` crudo hasta el próximo re-login.
function displayNameFromEmail(email: string | undefined): string {
  const prefix = email?.split("@")[0];
  if (!prefix) return "Usuário";
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function Home() {
  const session = await requireSession();
  const username = session.payload.name?.trim() || displayNameFromEmail(session.payload.email);

  let overview: Overview;
  let favorites: FavoriteWithReport[];
  try {
    [overview, favorites] = await Promise.all([
      apiServer<Overview>("/me/overview"),
      apiServer<FavoriteWithReport[]>("/favourites/me"),
    ]);
  } catch (err) {
    if (err instanceof ApiAuthError) redirect("/login");
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {username}
        </h1>
        <p className="text-sm text-muted-foreground">
          Plataforma BI · {roleLabel(session.payload.role)}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          icon={<FileBarChart2 className="h-6 w-6" />}
          label="Relatórios atribuídos"
          value={overview.assignedReports}
          hint={`em ${overview.workspaces} workspace${overview.workspaces === 1 ? "" : "s"}`}
        />
        <StatCard
          icon={<LayoutGrid className="h-6 w-6" />}
          label="Workspaces acessíveis"
          value={overview.workspaces}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Favoritos
            </h2>
          </div>
          <Badge variant="secondary" className="font-mono">
            {favorites.length}
          </Badge>
        </div>

        {favorites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Star className="h-6 w-6" />
              Você ainda não marcou relatórios como favoritos.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((fav) => {
              const reportIdPB = fav.report?.reportIdPB ?? fav.reportIdPB ?? "";
              const key = fav._id ?? reportIdPB ?? Math.random().toString(36);
              return (
                <FavoriteCard
                  key={key}
                  reportIdPB={reportIdPB}
                  name={fav.report?.name}
                  accountLabel={fav.report?.account?.nameAccount ?? null}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
