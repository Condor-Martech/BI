import type {
  LoginLog,
  LoginLogUserSummary,
} from "@/lib/api/endpoints/login-log";

export interface LoginLogRow {
  id: string;
  userKey: string;
  name: string;
  email: string;
  role: string;
  loginTimeRaw: string;
  loginTimeMs: number;
  isDeletedUser: boolean;
}

export interface AggregatedUser {
  key: string;
  name: string;
  email: string;
  role: string;
  count: number;
  lastAccessMs: number;
  lastAccessRaw: string;
  firstAccessMs: number;
  isDeleted: boolean;
}

function parseLegacyDate(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function toRow(log: LoginLog): LoginLogRow {
  const userField = log.user;
  const isObjectUser = userField != null && typeof userField !== "string";

  if (isObjectUser) {
    const u = userField as { _id?: string; name?: string; email?: string; role?: string };
    const userKey = u._id ?? u.email ?? log._id;
    return {
      id: log._id,
      userKey,
      name: u.name ?? "—",
      email: u.email ?? "—",
      role: u.role ?? "—",
      loginTimeRaw: log.loginTime,
      loginTimeMs: parseLegacyDate(log.loginTime),
      isDeletedUser: false,
    };
  }

  // user is a string (likely an ObjectId reference that didn't populate — deleted user)
  const ref = typeof userField === "string" ? userField : "";
  return {
    id: log._id,
    userKey: ref ? `deleted:${ref}` : `orphan:${log._id}`,
    name: "Usuário excluído",
    email: ref || "—",
    role: "—",
    loginTimeRaw: log.loginTime,
    loginTimeMs: parseLegacyDate(log.loginTime),
    isDeletedUser: true,
  };
}

/**
 * Adapta uma linha pré-agregada vinda de `/login-log/resumo-usuarios` para o
 * mesmo shape (`AggregatedUser`) consumido pela tabela "Por usuário".
 *
 * O endpoint retorna UMA linha por usuário cadastrado, inclusive quem nunca
 * logou (`accesos: 0`, `ultimoAcceso: null`). Como o backend não expõe o
 * primeiro acesso, `firstAccessMs` fica 0 — a UI só usa esse campo no sheet
 * de histórico, que consome os registros brutos separadamente.
 */
export function summaryToAggregated(s: LoginLogUserSummary): AggregatedUser {
  const rawLast =
    s.ultimoAcceso instanceof Date
      ? s.ultimoAcceso.toISOString()
      : s.ultimoAcceso ?? "";
  const lastAccessMs = rawLast ? parseLegacyDate(rawLast) : 0;
  return {
    key: s._id,
    name: s.name ?? "—",
    email: s.email ?? "—",
    role: s.role ?? "—",
    count: s.accesos,
    lastAccessMs,
    lastAccessRaw: rawLast,
    firstAccessMs: 0,
    isDeleted: false,
  };
}

export function aggregateByUser(rows: LoginLogRow[]): AggregatedUser[] {
  const map = new Map<string, AggregatedUser>();
  for (const r of rows) {
    const existing = map.get(r.userKey);
    if (!existing) {
      map.set(r.userKey, {
        key: r.userKey,
        name: r.name,
        email: r.email,
        role: r.role,
        count: 1,
        lastAccessMs: r.loginTimeMs,
        lastAccessRaw: r.loginTimeRaw,
        firstAccessMs: r.loginTimeMs,
        isDeleted: r.isDeletedUser,
      });
      continue;
    }
    existing.count += 1;
    if (r.loginTimeMs > existing.lastAccessMs) {
      existing.lastAccessMs = r.loginTimeMs;
      existing.lastAccessRaw = r.loginTimeRaw;
      existing.name = r.name;
      existing.email = r.email;
      existing.role = r.role;
    }
    if (r.loginTimeMs > 0 && (existing.firstAccessMs === 0 || r.loginTimeMs < existing.firstAccessMs)) {
      existing.firstAccessMs = r.loginTimeMs;
    }
  }
  return Array.from(map.values());
}
