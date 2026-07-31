import "server-only";

import { apiServer } from "@/lib/api/server";
import { getSession } from "@/lib/auth/session";

/**
 * Reads SUPER_ADMIN_EMAILS (comma-separated) with fallback to legacy
 * singular SUPER_ADMIN_EMAIL. Server env only — never expose to client.
 */
function getSuperAdminEmails(): Set<string> {
  const plural = process.env.SUPER_ADMIN_EMAILS ?? "";
  const singular = process.env.SUPER_ADMIN_EMAIL ?? "";
  const raw = plural.trim() !== "" ? plural : singular;
  return new Set(
    raw
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e.length > 0),
  );
}

export function isSuperAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const configured = getSuperAdminEmails();
  if (configured.size === 0) return false;
  return configured.has(email.toLowerCase().trim());
}

/**
 * Server-only: is the current cookie-holder the configured super-admin?
 */
export async function currentUserIsSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return isSuperAdmin(session?.payload?.email);
}

/**
 * Server-only: is the current cookie-holder on the backend admin allowlist?
 * Calls the legacy directly (bypasses the BFF). Any error (401/403/404/etc.)
 * maps to `false` — this is a gate, not a source of truth for errors.
 */
export async function currentUserIsAllowedAdmin(): Promise<boolean> {
  try {
    await apiServer<{ allowed: true }>("/users/admin/allowlist/me");
    return true;
  } catch {
    return false;
  }
}
