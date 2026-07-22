import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { OpenAiService } from './services/openai.service';
import { PowerBiQueryService } from './services/power-bi-query.service';
import { DaxGuard } from './services/dax-guard.service';
import { ReportAnalysis, ReportAnalysisSchema } from './report-analysis.entity';
import { AnalysisConversation, AnalysisConversationSchema } from './analysis-conversation.entity';
import { Report, ReportSchema } from '../reports/report.entity';
import { Group, GroupSchema } from '../groups/group.entity';

/**
 * Módulo aditivo de análise com IA de relatórios Power BI.
 *
 * Standalone: não modifica os módulos existentes. `AccountsModule` é @Global()
 * e expõe AccountsService; `CacheService` também é global. Aqui só registramos
 * o nosso próprio schema (ReportAnalysis) e referenciamos o schema do Report
 * via MongooseModule.forFeature, que é per-módulo e não afeta o ReportsModule.
 *
 * Único toque em arquivo existente: registrar este módulo em mod.module.ts.
 */
@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: ReportAnalysis.name, schema: ReportAnalysisSchema },
      { name: AnalysisConversation.name, schema: AnalysisConversationSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Group.name, schema: GroupSchema },
    ]),
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, PowerBiQueryService, OpenAiService, DaxGuard],
})
export class AnalysisModule {}
