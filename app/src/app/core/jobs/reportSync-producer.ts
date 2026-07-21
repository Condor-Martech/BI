import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';

export interface ReportSyncJobData {
  /** Usuario que disparó el sync — destinatario de los eventos SSE. */
  userID: string;
  /** Cuenta Power BI a re-sincronizar. */
  accountID: string;
}

export interface EnqueueResult {
  jobId: string;
  accountID: string;
  /** true si ya había un job pendiente/activo para esta accountID y reusamos ese. */
  dedup: boolean;
}

/**
 * Producer de la cola `reportSyncQueue`.
 *
 * Idempotencia: usamos `jobId: 'sync:<accountID>'`. Bull devuelve el job existente
 * si ya hay uno en cualquier estado para ese ID, así que dos clicks rápidos del
 * mismo usuario (o de dos usuarios para la misma cuenta) terminan compartiendo el
 * mismo job. `removeOnComplete: true` + `removeOnFail: { age: 3600 }` evita que
 * jobs viejos bloqueen re-syncs futuros.
 */
@Injectable()
export class ReportSyncProducer {
  private readonly logger = new Logger(ReportSyncProducer.name);

  constructor(@InjectQueue('reportSyncQueue') private readonly queue: Queue<ReportSyncJobData>) { }

  async enqueue(data: ReportSyncJobData): Promise<EnqueueResult> {
    const jobId = `sync:${data.accountID}`;

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed' || state === 'paused') {
        this.logger.log(`Reusing in-flight sync job ${jobId} (state=${state})`);
        return { jobId: String(existing.id), accountID: data.accountID, dedup: true };
      }
      // Job en estado terminal (completed/failed): lo removemos para permitir re-sync.
      await existing.remove();
    }

    const job = await this.queue.add('syncAccount', data, {
      jobId,
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
      // 3 attempts con backoff exponencial 5s→10s→20s. Cubre hipos transitorios
      // (throttling PowerBI, timeout de red, un AADSTS9002313 esporádico) sin
      // intervención manual. Fallos permanentes (refresh_token revocado) tardan
      // ~35s en fallar definitivamente — costo aceptable. Bull emite `failed`
      // sólo al agotar attempts, así que el SSE no dispara `sync.failed` prematuro.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });

    return { jobId: String(job.id), accountID: data.accountID, dedup: false };
  }
}
