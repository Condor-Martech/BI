import { z } from "zod";

/**
 * Schemas + query keys for the `/reports` module.
 *
 * Defensive shapes: the legacy backend returns raw Mongo documents in some flows.
 * Use `.passthrough()` so extra fields don't fail parsing, and parse what we use.
 */

export const reportListItemSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    reportIdPB: z.string().optional(),
    name: z.string().optional(),
    webUrl: z.string().optional(),
    embedUrl: z.string().optional(),
    groupIdPB: z.string().optional(),
    groupByPB: z.string().optional(),
    // Soft-hide (MANAGER-only feature). Legacy returns `hiddenByAdmin: false`
    // for non-hidden reports; `hiddenAt`/`hiddenBy` are `null` in that case.
    hiddenByAdmin: z.boolean().optional(),
    hiddenAt: z.union([z.string(), z.date()]).nullable().optional(),
    hiddenBy: z.string().nullable().optional(),
  })
  .passthrough();

export type ReportListItem = z.infer<typeof reportListItemSchema>;

/**
 * Populated account inside a report detail (`select` in reports.service.ts:200).
 * Carries the Azure access_token used by the Power BI embed SDK.
 */
export const reportAccountSchema = z
  .object({
    _id: z.string().optional(),
    nameAccount: z.string().optional(),
    email: z.string().optional(),
    token: z.string(),
  })
  .passthrough();

/**
 * `accountID` is declared in the legacy Mongoose schema as `[{ type: ObjectId, ref: 'Account' }]`
 * (an array), despite the singular name. `.populate('accountID')` therefore returns an
 * Account[]. Normalize to a single account so consumers can treat it as one object.
 */
const populatedAccountSchema = z.preprocess(
  (val) => (Array.isArray(val) ? val[0] : val),
  reportAccountSchema,
);

/**
 * Shape of `GET /reports/:reportId` — see legacy reports.service.ts:findOne().
 * The backend appends an email-filter to embedUrl server-side (row-level security).
 */
export const reportDetailSchema = z
  .object({
    _id: z.string().optional(),
    reportIdPB: z.string(),
    groupIdPB: z.string().optional(),
    name: z.string().optional(),
    embedUrl: z.string(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    accountID: populatedAccountSchema,
  })
  .passthrough();

export type ReportDetail = z.infer<typeof reportDetailSchema>;

/**
 * Response of `POST /reports/syncronize[/<accountId>]` — the legacy now enqueues
 * the sync into BullMQ and returns 202 with the list of jobIds (one per account).
 * Actual progress + result arrive via SSE (`sync.started` / `sync.progress` /
 * `sync.completed` / `sync.failed`) keyed by `jobId`.
 *
 * `dedup: true` means the backend reused an already-in-flight job for that
 * accountID instead of enqueueing a new one (idempotency by `sync:<accountId>`).
 */
export const syncEnqueueResponseSchema = z.object({
  accepted: z.literal(true),
  jobs: z.array(
    z.object({
      jobId: z.string(),
      accountID: z.string(),
      dedup: z.boolean(),
    }),
  ),
});

export type SyncEnqueueResponse = z.infer<typeof syncEnqueueResponseSchema>;
export type SyncEnqueueJob = SyncEnqueueResponse["jobs"][number];

export const reportsKeys = {
  all: ["reports"] as const,
  me: () => [...reportsKeys.all, "me"] as const,
  /** Workspace-scoped listing (`/me/reports?pbWorkspaceId=X`). */
  workspace: (pbWorkspaceId: string, includeHidden = false) =>
    [...reportsKeys.all, "workspace", pbWorkspaceId, { includeHidden }] as const,
  detail: (reportIdPB: string) => [...reportsKeys.all, "detail", reportIdPB] as const,
} as const;
