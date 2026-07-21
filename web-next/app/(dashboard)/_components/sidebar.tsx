"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import {
  ChevronLeft,
  HelpCircle,
  Home,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { isOwner, type Role } from "@/lib/auth/roles";
import { Separator } from "@/components/ui/separator";
import { springs } from "@/lib/motion/transitions";
import { cn } from "@/lib/utils";

import { BroadcastNotificationDialog } from "./broadcast-notification-dialog";
import { LogoutButton } from "./logout-button";
import { NotificationBell } from "./notification-bell";
import { SidebarAccountsSection } from "./sidebar-accounts-section";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: ReadonlyArray<Role>;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/ajuda", label: "Ajuda", icon: HelpCircle },
  { href: "/configuracao", label: "Configurações", icon: Settings },
];

const COOKIE_NAME = "bi_sidebar_collapsed";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superOnly?: boolean;
}

const ADMIN_NAV: ReadonlyArray<AdminNavItem> = [
  { href: "/admin/reset-password", label: "Reset de senha", icon: KeyRound },
  { href: "/admin/impersonate", label: "Ver como usuário", icon: UserCog },
  { href: "/admin/allowlist", label: "Gestão de acessos admin", icon: ShieldCheck, superOnly: true },
];

interface SidebarProps {
  role: Role;
  defaultCollapsed: boolean;
  defaultOpenAccountIds: string[];
  isSuperAdmin: boolean;
  isAllowedAdmin: boolean;
}

export function Sidebar({
  role,
  defaultCollapsed,
  defaultOpenAccountIds,
  isSuperAdmin,
  isAllowedAdmin,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  const canBroadcast = isOwner(role);
  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(role));
  const visibleAdminNav = isAllowedAdmin
    ? ADMIN_NAV.filter((item) => !item.superOnly || isSuperAdmin)
    : [];

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-12" : "w-56",
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 py-2 font-semibold tracking-tight">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          {canBroadcast && <BroadcastNotificationDialog />}
          <NotificationBell />
        </div>
      ) : (
        <div className="flex h-12 items-center gap-2 px-4 font-semibold tracking-tight">
          <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">Power BI</span>
          {canBroadcast && <BroadcastNotificationDialog />}
          <NotificationBell />
        </div>
      )}
      <Separator className="bg-sidebar-border" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <LayoutGroup id="sidebar-nav">
        <nav className="space-y-0.5 p-2" aria-label="Navegación principal">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  collapsed ? "justify-center" : "gap-2 px-2",
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={springs.fast}
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-sidebar-accent"
                    style={{ zIndex: -1 }}
                  />
                ) : null}
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
      </LayoutGroup>
      {!collapsed && (
        <>
          <Separator className="bg-sidebar-border" />
          <SidebarAccountsSection
            collapsed={collapsed}
            defaultOpenAccountIds={defaultOpenAccountIds}
          />
        </>
      )}
      {visibleAdminNav.length > 0 && (
        <>
          <Separator className="bg-sidebar-border" />
          <nav className="space-y-0.5 p-2" aria-label="Ferramentas admin">
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Ferramentas admin
              </p>
            )}
            {visibleAdminNav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-8 items-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed ? "justify-center" : "gap-2 px-2",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
            })}
          </nav>
        </>
      )}
      </div>
      <Separator className="bg-sidebar-border" />
      <div className="space-y-1 p-2">
        {!collapsed && (
          <p className="px-2 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
            ⌘K para buscar
          </p>
        )}
        <ThemeToggle collapsed={collapsed} />
        <LogoutButton collapsed={collapsed} />
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        aria-expanded={!collapsed}
        className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
      >
        <ChevronLeft
          className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")}
        />
      </button>
    </aside>
  );
}
