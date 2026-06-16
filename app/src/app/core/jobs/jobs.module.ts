import { Queue } from "bull";
import { BullAdapter, ExpressAdapter, createBullBoard } from '@bull-board/express';
import basicAuth = require("express-basic-auth");
import { Inject, MiddlewareConsumer, Module, NestModule, forwardRef } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bull";
import { SendMailWelcomeConsumer } from './sendMailWelcome-consumer';
import { SendMailWelcomeProducer } from './sendMailWelcome-producer';
import { SendMailResetConsumer } from './sendMailResetPass-consumer';
import { SendMailResetProducer } from './sendMailResetPass-producer';
import { ReportSyncConsumer } from './reportSync-consumer';
import { ReportSyncProducer } from './reportSync-producer';
import { MailerHttpService } from '../services/mailer-http.service';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { ReportsModule } from '../../modules/reports/reports.module';


// Defaults seguros para todas as queues registradas neste módulo. Producers podem
// sobrescrever opções pontuais (welcome/reset definem suas próprias retries),
// mas qualquer nova queue herda cleanup automático para não inflar Redis.
const DEFAULT_JOB_OPTIONS = {
    removeOnComplete: true,
    removeOnFail: { age: 86_400 },
};

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'sendMailWelcomeQueue',
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
        BullModule.registerQueue({
            name: 'sendMailResetQueue',
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
        BullModule.registerQueue({
            name: 'reportSyncQueue',
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
        // NotificationsModule expone `NotificationsService` (pushTransient para SSE).
        // ReportsModule expone `ReportsService` (consumer lo usa). `forwardRef` porque
        // ReportsController inyecta `ReportSyncProducer` del lado opuesto del grafo.
        NotificationsModule,
        forwardRef(() => ReportsModule),
        // GroupsService y EventsService llegan vía @Global() de sus modules.
    ],
    providers: [
        MailerHttpService,
        SendMailWelcomeConsumer,
        SendMailWelcomeProducer,
        SendMailResetConsumer,
        SendMailResetProducer,
        ReportSyncConsumer,
        ReportSyncProducer,

    ],
    exports: [
        SendMailWelcomeProducer,
        SendMailResetProducer,
        ReportSyncProducer,
    ]

})
export class JobModule implements NestModule {
    @Inject(getQueueToken('sendMailWelcomeQueue')) private readonly queueEmail: Queue;
    @Inject(getQueueToken('sendMailResetQueue')) private readonly queueReset: Queue;
    @Inject(getQueueToken('reportSyncQueue')) private readonly queueReportSync: Queue;

    configure(consumer: MiddlewareConsumer) {
        const serverAdapter = new ExpressAdapter()
        const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard(
            {
                queues: [
                    new BullAdapter(this.queueEmail),
                    new BullAdapter(this.queueReset),
                    new BullAdapter(this.queueReportSync),
                ],
                serverAdapter,
            },
        )
        serverAdapter.setBasePath('/admin/queues')

        // Basic-auth obrigatório: o Bull Board expõe payloads e stack traces dos jobs.
        // Os env vars BULL_BOARD_USER / BULL_BOARD_PASS são validados em REQUIRED_ENV_VARS
        // no app.config.ts, então se chegamos até aqui já estão setados.
        const auth = basicAuth({
            users: {
                [process.env.BULL_BOARD_USER]: process.env.BULL_BOARD_PASS,
            },
            challenge: true,
            realm: 'BullBoard',
        });

        consumer.apply(auth, serverAdapter.getRouter()).forRoutes('/admin/queues');
    }
}


