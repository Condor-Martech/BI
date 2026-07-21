/**
 * Audit log — Tier 3: "quién hizo qué".
 *
 * Distinto de `user_events`:
 * - Retention larga (compliance, 2 años+) vs `user_events` (90 días).
 * - Schema con snapshot del actor + before/after del recurso.
 * - Audiencia: admin/manager para revisar acciones, no para métricas.
 *
 * En v1 (Tier 1+2) este módulo se registra pero NO se emiten eventos todavía.
 * PR 4 (Tier 3) agrega las llamadas desde users.service, user-groups.service, etc.
 */

export const AUDIT_EVENT = 'audit.recorded' as const;

export const AUDIT_ACTIONS = {
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_DISABLE: 'user.disable',
  USER_ENABLE: 'user.enable',
  USER_PASSWORD_CHANGED_BY_ADMIN: 'user.password_changed_by_admin',

  USER_GROUP_CREATE: 'user_group.create',
  USER_GROUP_UPDATE: 'user_group.update',
  USER_GROUP_DELETE: 'user_group.delete',
  USER_GROUP_MEMBER_ADDED: 'user_group.member_added',
  USER_GROUP_MEMBER_REMOVED: 'user_group.member_removed',

  REPORT_PERMISSION_GRANTED: 'report.permission_granted',
  REPORT_PERMISSION_REVOKED: 'report.permission_revoked',

  ACCOUNT_CREATE: 'account.create',
  ACCOUNT_DELETE: 'account.delete',

  FILTER_CREATE: 'filter.create',
  FILTER_UPDATE: 'filter.update',
  FILTER_DELETE: 'filter.delete',

  MAP_CREATE: 'map.create',
  MAP_UPDATE: 'map.update',
  MAP_DELETE: 'map.delete',

  // RESET_BY_ADMIN: admin gera uma senha aleatória e a entrega manualmente ao usuário.
  // Distinto de USER_PASSWORD_CHANGED_BY_ADMIN, onde o admin define uma senha à sua escolha.
  USER_PASSWORD_RESET_BY_ADMIN: 'user.password_reset_by_admin',
  USER_IMPERSONATED: 'user.impersonated',
  ADMIN_ALLOWLIST_ADDED: 'admin.allowlist_added',
  ADMIN_ALLOWLIST_REMOVED: 'admin.allowlist_removed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESOURCE_TYPES = {
  USER: 'user',
  USER_GROUP: 'user_group',
  REPORT: 'report',
  ACCOUNT: 'account',
  FILTER: 'filter',
  MAP: 'map',
} as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];

export interface AuditActor {
  userId: string;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEventPayload {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  actor: AuditActor;
  /** Snapshot del recurso ANTES del cambio (para updates/deletes). */
  before?: Record<string, unknown> | null;
  /** Snapshot del recurso DESPUÉS del cambio (para creates/updates). */
  after?: Record<string, unknown> | null;
  /** Contexto adicional libre. */
  metadata?: Record<string, unknown> | null;
  at?: Date;
}

export const ALL_AUDIT_ACTIONS: ReadonlyArray<AuditAction> = Object.values(AUDIT_ACTIONS);
export const ALL_AUDIT_RESOURCE_TYPES: ReadonlyArray<AuditResourceType> =
  Object.values(AUDIT_RESOURCE_TYPES);
