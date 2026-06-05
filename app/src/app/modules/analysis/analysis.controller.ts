import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SentryInterceptor } from '../../core/sentry/sentry.interceptor';
import { ApiCommonResponses, ApiNotFound } from '../../core/api/swagger/api.response';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { RolesGuard } from '../../core/auth/roles.guard';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { AnalysisService } from './analysis.service';
import { AnalyzeReportDto } from './dto/analyze-report.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { ChatReportDto } from './dto/chat-report.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@ApiTags('Analysis')
@ApiBearerAuth()
@UseInterceptors(SentryInterceptor)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('report/:reportId')
  @ApiOperation({
    summary: 'Gerar análise narrativa de um relatório Power BI',
    description:
      'Dispara um análise com IA do relatório informado. O backend descobre o schema do dataset, ' +
      'permite que o LLM solicite queries DAX em um loop limitado (máx. 4 rodadas), executa essas queries ' +
      'contra a API executeQueries do Power BI e retorna um análise narrativo (resumo, achados, anomalias, ' +
      'recomendações) com as queries usadas para trazabilidade. Latência típica: 20-60s. Resultado é ' +
      'cacheado em Redis por 6h (use `refresh: true` para forçar recálculo). ATENÇÃO: executeQueries roda ' +
      'com o token de serviço do tenant — RLS por usuário NÃO é aplicado; qualquer usuário autenticado ' +
      'enxerga todos os dados do dataset (dívida de segurança consciente).',
  })
  @ApiParam({
    name: 'reportId',
    description: 'reportIdPB do relatório a analisar.',
    example: '6e277bac-97e4-43cc-ad65-b96dbdd65f57',
  })
  @ApiOkResponse({ description: 'Análise gerado (ou recuperado do cache).', type: AnalysisResponseDto })
  @ApiNotFound('Relatório não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async analyze(
    @Req() req: Request,
    @Param('reportId') reportId: string,
    @Body() dto: AnalyzeReportDto,
  ): Promise<AnalysisResponseDto> {
    return this.analysisService.analyzeReport(reportId, (req as any).user, dto ?? ({} as AnalyzeReportDto));
  }

  @Post('report/:reportId/chat')
  @ApiOperation({
    summary: 'Enviar uma mensagem ao chat de análise do relatório',
    description:
      'Um turno de conversa sobre o relatório. O backend mantém o contexto (a conversa é persistida), ' +
      'permite ao LLM solicitar queries DAX (loop limitado) e retorna uma resposta conversacional + ' +
      'gráficos gerados pelo modelo (generative UI). Se `conversationId` for omitido, cria uma nova ' +
      'conversa e devolve seu ID. Latência típica: 20-60s. ATENÇÃO: roda com o token de serviço sem ' +
      'RLS por usuário (dívida de segurança consciente).',
  })
  @ApiParam({ name: 'reportId', description: 'reportIdPB do relatório.', example: '6e277bac-97e4-43cc-ad65-b96dbdd65f57' })
  @ApiOkResponse({ description: 'Resposta do assistente para o turno.', type: ChatResponseDto })
  @ApiNotFound('Relatório ou conversa não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async chat(
    @Req() req: Request,
    @Param('reportId') reportId: string,
    @Body() dto: ChatReportDto,
  ): Promise<ChatResponseDto> {
    return this.analysisService.chat(reportId, (req as any).user, dto);
  }

  @Get('report/:reportId/conversations')
  @ApiOperation({
    summary: 'Listar as conversas do usuário para um relatório',
    description:
      'Retorna a lista paginada de conversas do usuário autenticado para o relatório (mais recentes ' +
      'primeiro), sem o array de mensagens — use GET /analysis/conversation/:id para o documento completo.',
  })
  @ApiParam({ name: 'reportId', description: 'reportIdPB.', example: '6e277bac-97e4-43cc-ad65-b96dbdd65f57' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiOkResponse({ description: 'Lista paginada de conversas.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async conversations(
    @Req() req: Request,
    @Param('reportId') reportId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
  ) {
    const userId = String((req as any).user?._id ?? '');
    return this.analysisService.getConversations(reportId, userId, Math.min(limit, 100), skip);
  }

  @Get('conversation/:id')
  @ApiOperation({
    summary: 'Buscar uma conversa completa pelo ID',
    description: 'Retorna a conversa com todas as mensagens (texto, gráficos e DAX por turno). Escopada ao usuário.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB da conversa.', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Documento da conversa.' })
  @ApiNotFound('Conversa não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async conversation(@Req() req: Request, @Param('id') id: string) {
    const userId = String((req as any).user?._id ?? '');
    return this.analysisService.getConversation(id, userId);
  }

  @Delete('conversation/:id')
  @ApiOperation({ summary: 'Remover uma conversa', description: 'Apaga a conversa do usuário autenticado.' })
  @ApiParam({ name: 'id', description: 'ID MongoDB da conversa.', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Conversa removida.' })
  @ApiNotFound('Conversa não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async removeConversation(@Req() req: Request, @Param('id') id: string) {
    const userId = String((req as any).user?._id ?? '');
    return this.analysisService.deleteConversation(id, userId);
  }

  @Get('all')
  @ApiOperation({
    summary: 'Listar todos os análises (paginado)',
    description:
      'Retorna a lista paginada de TODOS os análises gerados, de todos os relatórios, ordenados por data ' +
      '(mais recentes primeiro). Não inclui o array `daxRuns` completo — use GET /analysis/:id para o documento ' +
      'detalhado. Restrito ao papel MANAGER.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Limite por página (máx 100).' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiOkResponse({ description: 'Lista paginada de análises.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findAll(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
  ) {
    return this.analysisService.getAll(Math.min(limit, 100), skip);
  }

  @Get('report/:reportId/history')
  @ApiOperation({
    summary: 'Listar histórico de análises de um relatório',
    description:
      'Retorna a lista paginada de análises armazenados para o relatório (mais recentes primeiro). ' +
      'Não inclui o array `daxRuns` completo — use GET /analysis/:id para o documento detalhado.',
  })
  @ApiParam({ name: 'reportId', description: 'reportIdPB.', example: '6e277bac-97e4-43cc-ad65-b96dbdd65f57' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiOkResponse({ description: 'Lista paginada de análises.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async history(
    @Param('reportId') reportId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
  ) {
    return this.analysisService.getHistory(reportId, Math.min(limit, 100), skip);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar análise pelo ID',
    description: 'Retorna o documento completo de um análise armazenado, incluindo daxRuns e métricas de uso.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do análise.', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Documento de análise.' })
  @ApiNotFound('Análise não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findOne(@Param('id') id: string) {
    return this.analysisService.findOne(id);
  }
}
