import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bull';
import { Model } from 'mongoose';

import { GroupsService } from '../../modules/groups/groups.service';
import { ReportsService } from '../../modules/reports/reports.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { EventsService } from '../../modules/events/events.service';
import { Account, AccountDocument } from '../../modules/accounts/account.entity';
import type { ReportSyncJobData } from './reportSync-producer';

/**
 * Consumer de la cola `reportSyncQueue`.
 *
 * Responsabilidades:
 *  1. Ejecutar el sync de una cuenta Power BI (workspaces + reports vía Azure).
 *  2. Empujar eventos transitorios al SSE del usuario que disparó el sync
 *     (`sync.started`, `sync.progress`, `sync.completed`, `sync.failed`) —
 *     consumibles por el browser para actualizar toasts en tiempo real.
 *  3. Emitir eventos de auditoría (`account.sync_*`) vía EventsService para
 *     que queden persistidos en `user_events` por el listener correspondiente.
 *
 * Los pasos del sync son atómicos a nivel de Azure (`createAllGroupByAccount`
 * borra y recrea todos los groups de la cuenta antes de re-popularlos), así
 * que un fallo a mitad de camino deja la cuenta en estado vacío de groups —
 * el siguiente sync exitoso la repara. NO se hace rollback parcial.
 */
@Injectable()
@Processor('reportSyncQueue')
export class ReportSyncConsumer {
  private readonly logger = new Logger(ReportSyncConsumer.name);

  constructor(
    @Inject(forwardRef(() => GroupsService)) private readonly groupsService: GroupsService,
    @Inject(forwardRef(() => ReportsService)) private readonly reportsService: ReportsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
  ) { }

  /**
   * Persiste o estado do sync na conta. A UI (accounts/page.tsx) lê `syncStatus`
   * pra pintar um badge com tooltip mostrando o último erro. Silencia erros de
   * update — não queremos que uma falha ao gravar o status abortar o job.
   */
  private async setSyncStatus(
    accountID: string,
    patch: Partial<AccountDocument['syncStatus']>,
  ): Promise<void> {
    try {
      const current = await this.accountModel.findById(accountID).select('syncStatus').lean();
      const merged = { ...(current?.syncStatus ?? {}), ...patch };
      await this.accountModel.updateOne({ _id: accountID }, { $set: { syncStatus: merged } });
    } catch (err) {
      this.logger.warn(
        `Falha ao atualizar syncStatus da conta ${accountID}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  @Process('syncAccount')
  async syncAccount(job: Job<ReportSyncJobData>): Promise<void> {
    const { userID, accountID } = job.data;
    const jobId = String(job.id);

    this.notifications.pushTransient(userID, 'sync.started', { jobId, accountID });
    this.events.trackAccountSyncStarted({ userId: userID }, accountID);

    try {
      // Soft-hide preservation: capturamos el snapshot de reports ocultos ANTES
      // del deleteMany que hace createAllGroupByAccount. Guardamos hiddenBy +
      // hiddenAt originales para no perder la autoría del manager que ocultó
      // — reaplicar con "system-sync" borraría ese historial de auditoría.
      const hiddenSnapshot = await this.reportsService.getHiddenReportsSnapshot(accountID);

      // Paso 1: recrear todos los workspaces de la cuenta vía Power BI.
      this.notifications.pushTransient(userID, 'sync.progress', {
        jobId,
        accountID,
        phase: 'workspaces',
        message: 'Sincronizando workspaces…',
      });
      await this.groupsService.createAllGroupByAccount(accountID);

      // Paso 2: traer los workspaces recién creados desde Mongo.
      const groupsResult = await this.groupsService.findAllByAccount(accountID);
      const groups = groupsResult?.groups ?? [];

      // Paso 3: por cada workspace, traer todos los reports desde Power BI.
      this.notifications.pushTransient(userID, 'sync.progress', {
        jobId,
        accountID,
        phase: 'reports',
        total: groups.length,
        message: `Sincronizando reports de ${groups.length} workspace(s)…`,
      });
      await this.reportsService.getAllReportsByGroup(groups as any[], accountID);

      // Paso 4: reaplicar el flag hiddenByAdmin en los reports que sobrevivieron
      // al sync. Agrupamos por (hiddenBy, hiddenAt) para hacer un updateMany por
      // grupo — así preservamos la autoría original de cada report oculto sin
      // hacer N updates. updateMany es no-op si un reportIdPB ya no existe.
      if (hiddenSnapshot.length > 0) {
        const groupsByAuthor = new Map<string, { hiddenBy: string | null; hiddenAt: Date | null; ids: string[] }>();
        for (const item of hiddenSnapshot) {
          const key = `${item.hiddenBy ?? ''}|${item.hiddenAt?.toISOString() ?? ''}`;
          const existing = groupsByAuthor.get(key);
          if (existing) {
            existing.ids.push(item.reportIdPB);
          } else {
            groupsByAuthor.set(key, {
              hiddenBy: item.hiddenBy,
              hiddenAt: item.hiddenAt,
              ids: [item.reportIdPB],
            });
          }
        }
        for (const { hiddenBy, hiddenAt, ids } of groupsByAuthor.values()) {
          await this.reportsService.reapplyHiddenFlags(accountID, ids, hiddenBy, hiddenAt);
        }
      }

      // Conteo final: usamos includeHidden=true porque la métrica histórica
      // siempre reflejó "reports en el sistema" — con soft-hide activo, filtrar
      // aquí cambiaría el número sin razón funcional (el usuario ve la lista
      // filtrada por otras rutas). Los ocultos siguen persistidos.
      const all = await this.reportsService.findAll(true);
      const reportsCount = (all as any)?.reports?.length ?? (Array.isArray(all) ? all.length : 0);

      this.notifications.pushTransient(userID, 'sync.completed', {
        jobId,
        accountID,
        reportsCount,
        workspacesCount: groups.length,
      });
      this.events.trackAccountSyncCompleted({ userId: userID }, accountID, {
        reportsCount,
        workspacesCount: groups.length,
      });
    } catch (err) {
      const message = (err as Error)?.message ?? 'Sync failed';
      this.logger.error(`Sync failed for account ${accountID}: ${message}`, (err as Error)?.stack);

      this.notifications.pushTransient(userID, 'sync.failed', {
        jobId,
        accountID,
        error: message,
      });
      this.events.trackAccountSyncFailed({ userId: userID }, accountID, message);

      // Re-throw para que Bull marque el job como failed y respete attempts/backoff.
      throw err;
    }
  }

  @OnQueueActive()
  async onActive(job: Job<ReportSyncJobData>) {
    this.logger.log(`Sync starting: account=${job.data.accountID} user=${job.data.userID} jobId=${job.id}`);
    // attemptsMade fica em 0 até o primeiro throw — nosso "tentativa em curso" é +1.
    await this.setSyncStatus(job.data.accountID, {
      state: 'in_progress',
      lastJobId: String(job.id),
      attemptsMade: (job.attemptsMade ?? 0) + 1,
    });
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<ReportSyncJobData>) {
    this.logger.log(`Sync completed: account=${job.data.accountID} jobId=${job.id}`);
    await this.setSyncStatus(job.data.accountID, {
      state: 'ok',
      lastSuccessAt: new Date(),
      lastError: undefined,
      lastErrorAt: undefined,
    });
  }

  @OnQueueFailed()
  async onFailed(job: Job<ReportSyncJobData>, err: Error) {
    this.logger.error(`Sync failed: account=${job.data?.accountID} jobId=${job?.id}: ${err.message}`);
    // Bull dispara este hook em CADA tentativa que falha, inclusive as que
    // ainda vão ser retentadas. Só marcamos "failed" quando esgotaram os attempts —
    // do contrário o badge da UI ficaria vermelho no meio de uma cadeia de retries.
    const maxAttempts = job?.opts?.attempts ?? 1;
    const attemptsMade = job?.attemptsMade ?? 0;
    if (attemptsMade < maxAttempts) {
      return;
    }
    if (!job?.data?.accountID) return;
    await this.setSyncStatus(job.data.accountID, {
      state: 'failed',
      lastError: err?.message ?? 'Erro desconhecido',
      lastErrorAt: new Date(),
      attemptsMade,
    });
  }
}
