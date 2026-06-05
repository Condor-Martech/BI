import {
  Building2,
  History,
  Inbox,
  ShieldCheck,
  UserCircle2,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Role = "manager" | "admin" | "user";

interface ConfigCard {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  roles?: ReadonlyArray<Role>;
}

const CARDS: ReadonlyArray<ConfigCard> = [
  {
    href: "/login-log",
    label: "Auditoria",
    description: "Histórico de acessos e ações administrativas no sistema.",
    icon: History,
    roles: ["manager"],
  },
  {
    href: "/accounts",
    label: "Contas BI",
    description: "Gerencie as contas conectadas ao Power BI da plataforma.",
    icon: Building2,
    roles: ["manager"],
  },
  {
    href: "/grupos",
    label: "Grupos",
    description: "Organize usuários em grupos e atribua acesso a relatórios.",
    icon: UsersRound,
    roles: ["manager"],
  },
  {
    href: "/users",
    label: "Usuários",
    description: "Crie, edite e gerencie contas de usuários do sistema.",
    icon: Users,
    roles: ["manager", "admin"],
  },
  {
    href: "/configuracao/permissoes",
    label: "Permissões",
    description: "Atribua relatórios das contas BI aos usuários da plataforma.",
    icon: ShieldCheck,
    roles: ["manager"],
  },
  {
    href: "/notifications",
    label: "Notificações",
    description: "Histórico de notificações recebidas na plataforma.",
    icon: Inbox,
  },
  {
    href: "/configuracao/perfil",
    label: "Perfil",
    description: "Atualize seus dados pessoais e preferências da conta.",
    icon: UserCircle2,
  },
];

export default async function ConfiguracaoPage() {
  const session = await requireSession();
  const role = (session.payload.role ?? "user") as Role;
  const visibleCards = CARDS.filter((c) => !c.roles || c.roles.includes(role));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Centralize aqui a administração da plataforma e suas preferências de conta.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-card-foreground",
              "transition-colors hover:border-primary/50 hover:bg-accent/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold leading-none">{label}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      <footer className="mt-8 flex items-center justify-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Plataforma BI</span>
        <span aria-hidden>·</span>
        <span>
          versão {process.env.NEXT_PUBLIC_APP_VERSION ?? "—"}
        </span>
      </footer>
    </div>
  );
}
