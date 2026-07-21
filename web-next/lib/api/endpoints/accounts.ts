import { z } from "zod";

/**
 * Schemas + types + query keys for the `/accounts` module.
 *
 * Reference: legacy/app/src/app/modules/accounts/dto/{create-account,update-account}.dto.ts
 * Accounts store Azure AD credentials per Power BI tenant.
 */

/**
 * Estado do último sync desta conta. Escrito pelo backend em
 * `app/src/app/core/jobs/reportSync-consumer.ts` nos hooks OnQueueActive /
 * Completed / Failed. Usado pela accounts/page.tsx pra pintar um badge com
 * tooltip mostrando o último erro (se houver).
 */
export const syncStatusSchema = z
  .object({
    state: z.enum(["ok", "failed", "in_progress"]),
    lastError: z.string().optional().nullable(),
    lastErrorAt: z.union([z.string(), z.date()]).optional().nullable(),
    lastSuccessAt: z.union([z.string(), z.date()]).optional().nullable(),
    lastJobId: z.string().optional().nullable(),
    attemptsMade: z.number().optional().nullable(),
  })
  .passthrough()
  .nullable()
  .optional();

export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const accountSchema = z
  .object({
    _id: z.string(),
    nameAccount: z.string(),
    email: z.string(),
    clientId: z.string().optional(),
    tenantId: z.string().optional(),
    /** Live Azure access token — present on detail/related responses, not always on list. */
    token: z.string().optional(),
    /** Server returns userCount via getUserCount() on detail; on list it's derived too. */
    userCount: z.number().optional(),
    /** Cantidad de workspaces (grupos PBI) asociados a la cuenta — derivado en findAllAccounts. */
    groupCount: z.number().optional(),
    /** Cantidad de relatórios PBI asociados a la cuenta — derivado en findAllAccounts. */
    reportCount: z.number().optional(),
    users: z.array(z.string()).optional(),
    expiresIn: z.string().optional(),
    expiresOn: z.string().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    syncStatus: syncStatusSchema,
  })
  .passthrough();

export type Account = z.infer<typeof accountSchema>;

/** Body for POST /accounts/create — Azure AD credentials. */
export interface CreateAccountBody {
  nameAccount: string;
  email: string;
  pass: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export type UpdateAccountBody = Partial<CreateAccountBody>;

/** Body for POST /accounts/restore */
export interface RestoreBackupBody {
  fileName: string;
}

/** Response of POST /accounts/backup */
export const backupResponseSchema = z.object({
  file: z.string(),
});

/** Item shape of GET /accounts/backups */
export const backupItemSchema = z
  .object({
    name: z.string().optional(),
    fileName: z.string().optional(),
    size: z.number().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type BackupItem = z.infer<typeof backupItemSchema>;

export const accountsKeys = {
  all: ["accounts"] as const,
  list: () => [...accountsKeys.all, "list"] as const,
  detail: (id: string) => [...accountsKeys.all, "detail", id] as const,
  backups: () => [...accountsKeys.all, "backups"] as const,
} as const;
