import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Error as MongooseError } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { CacheService } from '../../core/cache/cache.service';
import { CACHE_TTL } from '../../core/cache/cache.keys';
import { Report, ReportDocument } from '../reports/report.entity';
import { ReportAnalysis, ReportAnalysisDocument } from './report-analysis.entity';
import { AnalysisConversation, AnalysisConversationDocument } from './analysis-conversation.entity';
import { OpenAiService } from './services/openai.service';
import { PowerBiQueryService, SchemaDigest } from './services/power-bi-query.service';
import { DaxGuard } from './services/dax-guard.service';
import { AnalyzeReportDto, AnalysisLanguage } from './dto/analyze-report.dto';
import { ChatReportDto } from './dto/chat-report.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import {
  ANALYSIS_CACHE,
  ANALYSIS_LIMITS,
  CHART_LIMITS,
  RUN_DAX_TOOL,
  buildChatFinalPrompt,
  buildChatSystemPrompt,
  buildFinalUserPrompt,
  buildSystemPrompt,
  estimateCostUsd,
} from './analysis.constants';

type AnalysisAccumulator = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  iterations: number;
  daxRuns: any[];
};

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly cache: CacheService,
    @InjectModel(ReportAnalysis.name) private readonly analysisModel: Model<ReportAnalysisDocument>,
    @InjectModel(AnalysisConversation.name)
    private readonly conversationModel: Model<AnalysisConversationDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    private readonly accounts: AccountsService,
    private readonly powerBi: PowerBiQueryService,
    private readonly openai: OpenAiService,
    private readonly daxGuard: DaxGuard,
  ) {}

  // ----- public API -----

  async analyzeReport(reportIdPB: string, user: any, dto: AnalyzeReportDto): Promise<AnalysisResponseDto> {
    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY não configurada — endpoints /analysis/* desabilitados.',
      );
    }

    const language = dto?.language || AnalysisLanguage.PT_BR;
    const focus = dto?.focus;
    const cacheKey = ANALYSIS_CACHE.latestReport(reportIdPB);

    if (dto?.refresh) {
      await this.cache.del(cacheKey);
    } else {
      const cached = await this.cache.get<AnalysisResponseDto>(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const result = await this.runAnalysis(reportIdPB, user, language, focus);
    if (result.status === 'success') {
      await this.cache.set(cacheKey, result, CACHE_TTL.SIX_HOURS);
    }
    return { ...result, cached: false };
  }

  async getAll(limit: number, skip: number) {
    const [items, count] = await Promise.all([
      this.analysisModel
        .find({}, { daxRuns: 0 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.analysisModel.countDocuments(),
    ]);
    return { items, count, limit, skip };
  }

  async getHistory(reportIdPB: string, limit: number, skip: number) {
    const [items, count] = await Promise.all([
      this.analysisModel
        .find({ reportId: reportIdPB }, { daxRuns: 0 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.analysisModel.countDocuments({ reportId: reportIdPB }),
    ]);
    return { items, count, limit, skip };
  }

  async findOne(id: string) {
    try {
      const doc = await this.analysisModel.findById(id).lean();
      if (!doc) throw new NotFoundException(`Análise não encontrada: ${id}`);
      return doc;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`ID inválido: ${id}`);
      }
      throw error;
    }
  }

  // ----- chat conversacional -----

  /**
   * Um turno de conversa sobre um relatório. Stateless do lado do cliente — o
   * histórico vive na conversa persistida; cada turno corre o loop agéntico
   * (LLM ↔ DAX) e devolve a resposta + gráficos gerados pelo modelo.
   */
  async chat(reportIdPB: string, user: any, dto: ChatReportDto): Promise<any> {
    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY não configurada — endpoints /analysis/* desabilitados.',
      );
    }
    const language = dto.language || AnalysisLanguage.PT_BR;
    const userId = String(user?._id ?? '');

    let conversation: AnalysisConversationDocument | null = null;
    if (dto.conversationId) {
      conversation = await this.findConversationDoc(dto.conversationId, userId);
    }

    const { report, token } = await this.resolveReportAndToken(reportIdPB);
    const schema = await this.getSchema(reportIdPB, token, report.groupIdPB, report.datasetId);

    if (!conversation) {
      conversation = new this.conversationModel({
        reportId: reportIdPB,
        reportName: report.name,
        datasetId: report.datasetId,
        groupId: report.groupIdPB,
        userId,
        userEmail: user?.email,
        language,
        title: dto.message.slice(0, 60),
        messages: [],
      });
    } else {
      conversation.language = language;
    }

    // Monta o contexto: system + schema + histórico + nova mensagem.
    const messages: any[] = [
      { role: 'system', content: buildChatSystemPrompt(language, report.name) },
      {
        role: 'user',
        content:
          'Dataset schema (raw from DAX INFO functions):\n' +
          (schema.digest || '(schema indisponível — responda apenas com base no nome do relatório)'),
      },
    ];
    for (const m of conversation.messages) {
      if (m?.role === 'user' || m?.role === 'assistant') {
        messages.push({ role: m.role, content: this.asString(m.content) });
      }
    }
    messages.push({ role: 'user', content: dto.message });

    const acc: AnalysisAccumulator = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      iterations: 0,
      daxRuns: [],
    };

    // Loop agéntico
    while (acc.iterations < ANALYSIS_LIMITS.MAX_TOOL_ITERATIONS) {
      const { message, usage } = await this.openai.chat(messages, { tools: [RUN_DAX_TOOL] });
      this.accumulateUsage(acc, usage);
      messages.push(message);
      const toolCalls: any[] = message?.tool_calls ?? [];
      if (toolCalls.length === 0) break;
      acc.iterations++;
      for (const tc of toolCalls) {
        const toolResult = await this.handleToolCall(tc, token, report.groupIdPB, report.datasetId, acc.daxRuns);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
      }
    }

    // Pase final — resposta conversacional + charts em JSON
    messages.push({ role: 'user', content: buildChatFinalPrompt(language) });
    const finalChat = await this.openai.chat(messages, { responseFormat: { type: 'json_object' } });
    this.accumulateUsage(acc, finalChat.usage);

    const parsed = this.safeParseJson(finalChat.message?.content);
    const reply = this.asString(parsed?.reply) || '(sem resposta)';
    const charts = this.sanitizeCharts(parsed?.charts);
    const status = this.determineStatus(schema, acc.daxRuns);
    const turnCost = estimateCostUsd(this.openai.model, acc.promptTokens, acc.completionTokens);

    const now = new Date();
    conversation.messages.push({ role: 'user', content: dto.message, createdAt: now });
    conversation.messages.push({
      role: 'assistant',
      content: reply,
      charts,
      daxRuns: acc.daxRuns,
      createdAt: now,
    });
    conversation.markModified('messages');
    conversation.model = this.openai.model;
    conversation.totalTokens = (conversation.totalTokens || 0) + acc.totalTokens;
    conversation.estimatedCostUsd = (conversation.estimatedCostUsd || 0) + turnCost;
    conversation.status = status;
    await conversation.save();

    return {
      conversationId: String(conversation._id),
      reply,
      charts,
      daxQueries: acc.daxRuns.map((r: any) => ({
        purpose: r.purpose,
        query: r.query,
        rowCount: r.rowCount,
        truncated: r.truncated,
        sampleRows: r.sampleRows,
        error: r.error,
      })),
      usage: {
        promptTokens: acc.promptTokens,
        completionTokens: acc.completionTokens,
        totalTokens: acc.totalTokens,
        estimatedCostUsd: turnCost,
        model: this.openai.model,
      },
      status,
    };
  }

  /** Lista de conversas do usuário para um relatório (sem o array de mensagens). */
  async getConversations(reportIdPB: string, userId: string, limit: number, skip: number) {
    const filter = { reportId: reportIdPB, userId };
    const [items, count] = await Promise.all([
      this.conversationModel.aggregate([
        { $match: filter },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            title: 1,
            updatedAt: 1,
            messageCount: { $size: { $ifNull: ['$messages', []] } },
          },
        },
      ]),
      this.conversationModel.countDocuments(filter),
    ]);
    return { items, count, limit, skip };
  }

  /** Documento completo de uma conversa (com mensagens), escopado ao usuário. */
  async getConversation(id: string, userId: string) {
    const doc = await this.findConversationDoc(id, userId);
    return doc.toObject();
  }

  /** Remove uma conversa do usuário. */
  async deleteConversation(id: string, userId: string) {
    let res: any;
    try {
      res = await this.conversationModel.deleteOne({ _id: id, userId });
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`ID inválido: ${id}`);
      }
      throw error;
    }
    if (!res?.deletedCount) {
      throw new NotFoundException(`Conversa não encontrada: ${id}`);
    }
    return { deleted: true };
  }

  // ----- private -----

  /**
   * Resolve o relatório + um access token Power BI fresco da conta de serviço.
   * Força refresh incondicional (getNewAccessToken) para contornar dois bugs:
   *   a) RefreshToken.refresh() só dispara <3min do vencimento, mas Azure pode
   *      invalidar antes (password change / conditional access / revoke) → 403.
   *   b) getIdAccount() devolve a instância Mongoose lida ANTES do refresh.
   */
  private async resolveReportAndToken(reportIdPB: string): Promise<{ report: any; token: string }> {
    const report: any = await this.reportModel.findOne({ reportIdPB });
    if (!report) {
      throw new NotFoundException(`Relatório não encontrado: ${reportIdPB}`);
    }
    if (!report.datasetId) {
      throw new BadRequestException('Relatório sem datasetId associado — não é possível analisar.');
    }
    if (!report.groupIdPB) {
      throw new BadRequestException('Relatório sem groupIdPB — não é possível analisar.');
    }

    const accountRef: any = Array.isArray(report.accountID) ? report.accountID[0] : report.accountID;
    if (!accountRef) {
      throw new BadRequestException('Relatório sem conta BI associada — não é possível analisar.');
    }

    const accountForEmail: any = await this.accounts.getIdAccount(String(accountRef));
    if (!accountForEmail?.email) {
      throw new ServiceUnavailableException('Conta BI inválida — sem email.');
    }

    let token: string;
    try {
      const refreshed: any = await this.accounts.getNewAccessToken(accountForEmail.email);
      token = refreshed?.[0]?.token;
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Falha ao renovar token da conta BI (${accountForEmail.email}): ${err?.message ?? err}. ` +
          'Pode ser que o refresh_token também esteja invalidado — recadastre a conta via POST /accounts/create.',
      );
    }
    if (!token) {
      throw new ServiceUnavailableException('Conta BI sem token válido após refresh.');
    }
    return { report, token };
  }

  /** Schema digest com cache Redis (6h) — evita re-descobrir a cada turno do chat. */
  private async getSchema(
    reportIdPB: string,
    token: string,
    groupId: string,
    datasetId: string,
  ): Promise<SchemaDigest> {
    const key = ANALYSIS_CACHE.schema(reportIdPB);
    const cached = await this.cache.get<SchemaDigest>(key);
    if (cached) return cached;
    const schema = await this.powerBi.discoverSchema(token, groupId, datasetId);
    if (schema.complete) {
      await this.cache.set(key, schema, CACHE_TTL.SIX_HOURS);
    }
    return schema;
  }

  /** Busca uma conversa por id escopada ao usuário; 404 se não existir, 400 se id inválido. */
  private async findConversationDoc(id: string, userId: string): Promise<AnalysisConversationDocument> {
    let doc: AnalysisConversationDocument | null;
    try {
      doc = await this.conversationModel.findOne({ _id: id, userId });
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`ID inválido: ${id}`);
      }
      throw error;
    }
    if (!doc) throw new NotFoundException(`Conversa não encontrada: ${id}`);
    return doc;
  }

  /** Sanitiza as specs de gráfico vindas do LLM — aplica caps e descarta inválidas. */
  private sanitizeCharts(raw: any): any[] {
    if (!Array.isArray(raw)) return [];
    const out: any[] = [];
    for (const c of raw.slice(0, CHART_LIMITS.MAX_CHARTS)) {
      if (!c || typeof c !== 'object') continue;
      const type = this.asString(c.type).toLowerCase();
      if (!CHART_LIMITS.ALLOWED_TYPES.includes(type as any)) continue;
      const xKey = this.asString(c.xKey);
      if (!xKey) continue;
      const series = Array.isArray(c.series)
        ? c.series
            .slice(0, CHART_LIMITS.MAX_SERIES)
            .filter((s: any) => s && this.asString(s.key))
            .map((s: any) => {
              const item: any = { key: this.asString(s.key) };
              if (s.label) item.label = this.asString(s.label);
              return item;
            })
        : [];
      if (series.length === 0) continue;
      const data = Array.isArray(c.data)
        ? c.data.slice(0, CHART_LIMITS.MAX_DATA_POINTS).filter((d: any) => d && typeof d === 'object')
        : [];
      if (data.length === 0) continue;
      out.push({ title: this.asString(c.title) || 'Gráfico', type, data, xKey, series });
    }
    return out;
  }

  private async runAnalysis(
    reportIdPB: string,
    user: any,
    language: string,
    focus: string | undefined,
  ): Promise<AnalysisResponseDto> {
    const acc: AnalysisAccumulator = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      iterations: 0,
      daxRuns: [],
    };
    let report: any = null;

    try {
      const resolved = await this.resolveReportAndToken(reportIdPB);
      report = resolved.report;
      const token = resolved.token;

      const schema = await this.getSchema(reportIdPB, token, report.groupIdPB, report.datasetId);

      const messages: any[] = [
        { role: 'system', content: buildSystemPrompt(language, focus) },
        {
          role: 'user',
          content:
            `Report: ${report.name ?? reportIdPB}\n` +
            (focus ? `Focus: ${focus}\n` : '') +
            '\nDataset schema (raw from DAX INFO functions):\n' +
            (schema.digest || '(schema indisponível — analise apenas com base no nome do relatório)'),
        },
      ];

      // Loop agéntico
      while (acc.iterations < ANALYSIS_LIMITS.MAX_TOOL_ITERATIONS) {
        const { message, usage } = await this.openai.chat(messages, { tools: [RUN_DAX_TOOL] });
        this.accumulateUsage(acc, usage);
        messages.push(message);
        const toolCalls: any[] = message?.tool_calls ?? [];
        if (toolCalls.length === 0) break;

        acc.iterations++;
        for (const tc of toolCalls) {
          const toolResult = await this.handleToolCall(tc, token, report.groupIdPB, report.datasetId, acc.daxRuns);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
        }
      }

      // Final pass — força saída JSON estruturada
      messages.push({ role: 'user', content: buildFinalUserPrompt(language) });
      const finalChat = await this.openai.chat(messages, { responseFormat: { type: 'json_object' } });
      this.accumulateUsage(acc, finalChat.usage);

      const parsed = this.safeParseJson(finalChat.message?.content);
      const status = this.determineStatus(schema, acc.daxRuns);

      const saved = await this.analysisModel.create({
        reportId: reportIdPB,
        reportName: report.name,
        datasetId: report.datasetId,
        groupId: report.groupIdPB,
        userId: String(user?._id ?? ''),
        userEmail: user?.email,
        language,
        focus,
        summary: this.asString(parsed?.summary),
        keyFindings: this.asStringArray(parsed?.keyFindings),
        anomalies: this.asStringArray(parsed?.anomalies),
        recommendations: this.asStringArray(parsed?.recommendations),
        daxRuns: acc.daxRuns,
        model: this.openai.model,
        promptTokens: acc.promptTokens,
        completionTokens: acc.completionTokens,
        totalTokens: acc.totalTokens,
        estimatedCostUsd: estimateCostUsd(this.openai.model, acc.promptTokens, acc.completionTokens),
        iterations: acc.iterations,
        status,
      });

      return this.toResponseDto(saved, false);
    } catch (error) {
      // 4xx de validação → não persiste failed (erro do chamador, não do sistema)
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      await this.persistFailed(reportIdPB, report, user, language, focus, acc, error);
      throw error;
    }
  }

  private async handleToolCall(
    tc: any,
    token: string,
    groupId: string,
    datasetId: string,
    daxRuns: any[],
  ): Promise<string> {
    let args: any = {};
    try {
      args = JSON.parse(tc?.function?.arguments ?? '{}');
    } catch {
      return JSON.stringify({ error: 'Argumentos inválidos (JSON malformado).' });
    }
    const dax: string = args?.query;
    const purpose: string = args?.purpose ?? '';
    const check = this.daxGuard.validate(dax);
    if (!check.ok) {
      daxRuns.push({ purpose, query: dax, rowCount: 0, sampleRows: [], error: check.reason });
      return JSON.stringify({ error: `DAX rejeitado: ${check.reason}` });
    }

    try {
      const { rows, rowCount } = await this.powerBi.executeQuery(token, groupId, datasetId, dax);
      const sampleForModel = rows.slice(0, ANALYSIS_LIMITS.MAX_ROWS_TO_MODEL);
      const sampleForPersist = rows.slice(0, ANALYSIS_LIMITS.MAX_ROWS_TO_PERSIST);
      const truncated = rowCount > ANALYSIS_LIMITS.MAX_ROWS_TO_MODEL;
      daxRuns.push({
        purpose,
        query: dax,
        rowCount,
        truncated,
        sampleRows: sampleForPersist,
      });
      return JSON.stringify({ rowCount, truncated, rows: sampleForModel });
    } catch (error: any) {
      // 401/403 são fatais — propagam e abortam o loop.
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      daxRuns.push({
        purpose,
        query: dax,
        rowCount: 0,
        sampleRows: [],
        error: error?.message ?? 'erro desconhecido',
      });
      return JSON.stringify({ error: `Erro ao executar DAX: ${error?.message ?? 'desconhecido'}` });
    }
  }

  private accumulateUsage(acc: AnalysisAccumulator, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) {
    acc.promptTokens += usage.promptTokens;
    acc.completionTokens += usage.completionTokens;
    acc.totalTokens += usage.totalTokens;
  }

  private determineStatus(schema: { complete: boolean }, daxRuns: any[]): string {
    const hasSuccessfulRun = daxRuns.some((r) => !r.error);
    if (!schema.complete && daxRuns.length === 0) return 'partial';
    if (daxRuns.length > 0 && !hasSuccessfulRun) return 'partial';
    return 'success';
  }

  private safeParseJson(content: string | undefined): any {
    if (!content) return {};
    try {
      return JSON.parse(content);
    } catch {
      this.logger.warn('Final pass — JSON inválido do LLM, retornando objeto vazio.');
      return {};
    }
  }

  private asString(v: any): string {
    if (typeof v === 'string') return v;
    if (v == null) return '';
    try { return String(v); } catch { return ''; }
  }

  private asStringArray(v: any): string[] {
    if (Array.isArray(v)) return v.map((x) => this.asString(x)).filter((s) => s.length > 0);
    if (typeof v === 'string' && v.trim()) return [v];
    return [];
  }

  private toResponseDto(doc: any, cached: boolean): AnalysisResponseDto {
    const createdAt: Date = doc.createdAt ?? new Date();
    return {
      reportId: doc.reportId,
      analysisId: String(doc._id),
      generatedAt: createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString(),
      language: doc.language,
      summary: doc.summary || '',
      keyFindings: doc.keyFindings || [],
      anomalies: doc.anomalies || [],
      recommendations: doc.recommendations || [],
      daxQueries: (doc.daxRuns || []).map((r: any) => ({
        purpose: r.purpose,
        query: r.query,
        rowCount: r.rowCount,
        truncated: r.truncated,
        sampleRows: r.sampleRows,
        error: r.error,
      })),
      usage: {
        promptTokens: doc.promptTokens || 0,
        completionTokens: doc.completionTokens || 0,
        totalTokens: doc.totalTokens || 0,
        estimatedCostUsd: doc.estimatedCostUsd || 0,
        model: doc.model,
      },
      cached,
      status: doc.status,
    };
  }

  private async persistFailed(
    reportIdPB: string,
    report: any,
    user: any,
    language: string,
    focus: string | undefined,
    acc: AnalysisAccumulator,
    error: any,
  ) {
    try {
      await this.analysisModel.create({
        reportId: reportIdPB,
        reportName: report?.name,
        datasetId: report?.datasetId,
        groupId: report?.groupIdPB,
        userId: String(user?._id ?? ''),
        userEmail: user?.email,
        language,
        focus,
        summary: '',
        keyFindings: [],
        anomalies: [],
        recommendations: [],
        daxRuns: acc.daxRuns,
        model: this.openai.model,
        promptTokens: acc.promptTokens,
        completionTokens: acc.completionTokens,
        totalTokens: acc.totalTokens,
        estimatedCostUsd: estimateCostUsd(this.openai.model, acc.promptTokens, acc.completionTokens),
        iterations: acc.iterations,
        status: 'failed',
        errorMessage: this.errorMessage(error),
      });
    } catch (persistErr: any) {
      this.logger.error(`Falha ao persistir doc 'failed': ${persistErr?.message ?? persistErr}`);
    }
  }

  private errorMessage(error: any): string {
    if (error instanceof HttpException) return error.message;
    return error?.message ?? String(error);
  }
}
