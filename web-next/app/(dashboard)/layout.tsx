import { Suspense } from "react";
import { cookies } from "next/headers";
import { IdentifyComponent } from "@openpanel/nextjs";

import { SdCredit } from "@/components/ui/sd-credit";
import { getSession } from "@/lib/auth/session";

import { CommandPalette } from "./_components/command-palette";
import { NotificationStreamMount } from "./_components/notification-stream-mount";
import { SessionExpiryBanner } from "./_components/session-expiry-banner";
import { Sidebar } from "./_components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const role = (session?.payload.role ?? "user") as "manager" | "admin" | "user";
  const isPrivileged = role === "manager" || role === "admin";

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("bi_sidebar_collapsed")?.value === "1";
  const defaultOpenAccountIds = (cookieStore.get("bi_sidebar_open_accounts")?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex h-screen">
      {/* OpenPanel: identifica al usuario logueado → "usuarios conectados" en tiempo real. */}
      {session?.payload.id && (
        <IdentifyComponent
          profileId={session.payload.id}
          email={session.payload.email}
          properties={{ role }}
        />
      )}

      {/* SSE notification stream — mounted once for the whole dashboard tree. */}
      <NotificationStreamMount />

      {/* Session expiry warning at T-5min (legacy has no JWT refresh). */}
      <SessionExpiryBanner exp={session?.payload.exp} />

      {/* Global ⌘K / Ctrl+K palette. */}
      <CommandPalette isPrivileged={isPrivileged} />

      <Sidebar
        role={role}
        defaultCollapsed={defaultCollapsed}
        defaultOpenAccountIds={defaultOpenAccountIds}
      />

      <main className="flex-1 overflow-auto bg-background">
        <div className="flex min-h-full flex-col">
          <div className="flex-1">
            <Suspense>{children}</Suspense>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
            <SdCredit />
            {/* OpenPanel visitor counter — solo manager/admin, no `user`. */}
            {isPrivileged && (
              <iframe
                src="https://opdashboard.cndr.me/widget/counter?shareId=RTwgeb"
                height={32}
                style={{ border: "none", overflow: "hidden" }}
                title="Visitor Counter"
              />
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
