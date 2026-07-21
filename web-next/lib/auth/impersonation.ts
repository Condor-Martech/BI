import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessCookieOptions } from "./cookies";
import { decodeJwt, isJwtExpired } from "./jwt";

export const ADMIN_COOKIE = "bi_admin_token";

export async function beginImpersonation(targetToken: string): Promise<void> {
  const store = await cookies();
  const current = store.get(ACCESS_COOKIE);
  if (!current) throw new Error("no active session");

  const targetDecoded = decodeJwt(targetToken);
  const adminDecoded = decodeJwt(current.value);
  const now = Math.floor(Date.now() / 1000);

  const targetMaxAge = targetDecoded?.exp ? Math.max(1, targetDecoded.exp - now) : 3600;
  const adminMaxAge = adminDecoded?.exp ? Math.max(1, adminDecoded.exp - now) : 3600;

  store.set(ADMIN_COOKIE, current.value, accessCookieOptions(adminMaxAge));
  store.set(ACCESS_COOKIE, targetToken, accessCookieOptions(targetMaxAge));
}

export async function stopImpersonation(): Promise<{ ok: true; expired: boolean }> {
  const store = await cookies();
  const admin = store.get(ADMIN_COOKIE);
  if (!admin) return { ok: true, expired: false };

  if (isJwtExpired(admin.value)) {
    store.delete(ADMIN_COOKIE);
    store.delete(ACCESS_COOKIE);
    return { ok: true, expired: true };
  }

  const decoded = decodeJwt(admin.value);
  const now = Math.floor(Date.now() / 1000);
  const maxAge = decoded?.exp ? Math.max(1, decoded.exp - now) : 3600;

  store.set(ACCESS_COOKIE, admin.value, accessCookieOptions(maxAge));
  store.delete(ADMIN_COOKIE);
  return { ok: true, expired: false };
}
