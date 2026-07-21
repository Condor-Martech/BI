import "server-only";

import { apiServer } from "@/lib/api/server";
import { getSession } from "@/lib/auth/session";

/**
 * Pure, synchronous check: is this email the configured super-admin?
 * Safe to call from anywhere; but SUPER_ADMIN_EMAIL is only read from the
 * server env (do NOT prefix with NEXT_PUBLIC_ — it must not leak to the client).
 */
export function isSuperAdmin(email: string | undefined): boolean {
  const configured = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
  if (!configured || !email) return false;
  return email.toLowerCase().trim() === configured;
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
