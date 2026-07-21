/**
 * Lightweight JWT helpers — decode-only, NO signature verification.
 *
 * We don't verify the signature client/server-side; the legacy backend does that.
 * We only need to read `exp` to:
 *   - derive cookie maxAge in /api/auth/login
 *   - short-circuit expired cookies in middleware (avoid a round-trip)
 *   - surface session-expiry UX to the user (T-5min banner)
 */

export interface JwtPayload {
  exp?: number;
  iat?: number;
  id?: string;
  email?: string;
  role?: string;
  // Presente en tokens emitidos después de agregar `name` a `authenticationData`
  // en el backend. Tokens antiguos no lo tienen — el caller debe caer a un
  // fallback (ej: derivar del email) hasta que el user haga re-login.
  name?: string;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): string | null {
  try {
    const padded = input
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
    return atob(padded);
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  const json = base64UrlDecode(payloadB64);
  if (json === null) return null;
  try {
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

const EIGHT_HOURS = 8 * 60 * 60;

export function jwtExpirySeconds(token: string, fallback = EIGHT_HOURS): number {
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return fallback;
  const now = Math.floor(Date.now() / 1000);
  const ttl = decoded.exp - now;
  return ttl > 0 ? ttl : fallback;
}

export function isJwtExpired(token: string): boolean {
  const decoded = decodeJwt(token);
  // No exp claim → can't determine; assume valid (backend will reject if not).
  if (!decoded?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return decoded.exp <= now;
}
