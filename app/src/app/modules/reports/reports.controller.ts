import { Controller, Get, Post, Patch, Param, Query, Delete, Inject, forwardRef, Req, UseInterceptors, UseGuards, NotFoundException, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { SentryInterceptor } from '../../core/sentry/sentry.interceptor';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { RolesGuard } from '../../core/auth/roles.guard';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { GroupsService } from '../groups/groups.service';
import { ReportsService } from './reports.service';
import { ApiCommonResponses, ApiNotFound } from '../../core/api/swagger/api.response';
import { ReportResponseDto } from './dto/create-report.dto';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { ReportAccessGuard } from '../../core/permissions/report-access.guard';
import { EventsService } from '../events/events.service';
import { EventActor } from '../events/events.constants';
import { ReportSyncProducer, EnqueueResult } from '../../core/jobs/reportSync-producer';
import { Request } from 'express';

interface SyncEnqueueResponse {
  accepted: true;
  jobs: EnqueueResult[];
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseInterceptors(SentryInterceptor)
@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(forwardRef(() => ReportsService))
    private reportsService: ReportsService,
    private groupsService: GroupsService,
    private readonly permissions: PermissionsService,
    private readonly events: EventsService,
    private readonly reportSync: ReportSyncProducer,

  ) { }

  @Post('syncronize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Encolar sync de workspaces/reports Power BI para TODAS as contas do usuário',
    description: 'Encola um job de sync por cada conta vinculada ao usuário autenticado. Retorna 202 com a lista de jobIds. O progresso e o resultado de cada sync chegam via SSE em `/notifications/stream` como eventos `sync.started` / `sync.progress` / `sync.completed` / `sync.failed`. Rota preservada com a grafia original (`syncronize`). Restrito ao papel MANAGER.',
  })
  @ApiAcceptedResponse({ description: 'Jobs encolados — escutar SSE para progress.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async syncronizeByApi(@Req() req: Request): Promise<SyncEnqueueResponse> {
    const user: any = req.user;
    const userID: string = user.id || user._id?.toString();
    const accountIDs = user.accountID;
    if (!accountIDs || accountIDs.length === 0) {
      throw new NotFoundException('No account IDs found.');
    }
    const jobs = await Promise.all(
      accountIDs.map((accountID: any) =>
        this.reportSync.enqueue({ userID, accountID: accountID._id?.toString() ?? String(accountID) }),
      ),
    );
    return { accepted: true, jobs };
  }

  @Post('syncronize/:accountId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Encolar sync de uma única conta Power BI',
    description: 'Encola um job de sync apenas para a conta informada. Retorna 202 com o jobId. Progresso e resultado chegam via SSE em `/notifications/stream`. Idempotente: se já existe um job ativo/pendente para essa conta, retorna o jobId existente (`dedup: true`). Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'accountId', description: 'ID MongoDB da conta a ser sincronizada', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiAcceptedResponse({ description: 'Job encolado — escutar SSE para progress.' })
  @ApiNotFound('Conta não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async syncronizeAccountByApi(@Req() req: Request, @Param('accountId') accountId: string): Promise<SyncEnqueueResponse> {
    const user: any = req.user;
    const userID: string = user.id || user._id?.toString();
    const job = await this.reportSync.enqueue({ userID, accountID: accountId });
    return { accepted: true, jobs: [job] };
  }

  @Get("all")
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar todos os relatórios',
    description: 'Retorna a lista completa de relatórios Power BI persistidos no banco local, sem filtragem por usuário. Por padrão exclui relatórios ocultos (soft-hide); passe `?includeHidden=true` para incluí-los. Restrito ao papel MANAGER.',
  })
  @ApiQuery({ name: 'includeHidden', required: false, type: Boolean, description: 'Se `true`, inclui relatórios ocultados via soft-hide. Padrão: `false`.' })
  @ApiOkResponse({ description: 'Lista de relatórios retornada com sucesso.', type: [ReportResponseDto] })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findAll(@Query('includeHidden') includeHidden?: string) {
    // Endpoint já é MANAGER-only via @Roles, então não precisa validação extra
    // pra ignorar o flag em caller não-privilegiado — o guard barra antes.
    const include = includeHidden === 'true' || includeHidden === '1';
    return await this.reportsService.findAll(include);
  };

  // Declarado ANTES de @Get(':reportId') — Express matcha por ordem; ':reportId' capturaria 'me'.
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar os relatórios acessíveis ao usuário autenticado',
    description: 'Retorna os relatórios que o usuário pode acessar: os atribuídos diretamente (reportsByPB) somados aos do seu grupo de usuários, resolvidos em tempo real. Para MANAGER/ADMIN retorna todos. Relatórios ocultos (soft-hide) nunca são retornados por esta rota. Acessível para os papéis USER e MANAGER.',
  })
  @ApiOkResponse({ description: 'Lista de relatórios acessíveis retornada com sucesso.', type: [ReportResponseDto] })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.USER, ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN)
  async findMine(@Req() req: Request) {
    const user = req.user;
    if (this.permissions.isPrivileged(user)) {
      // includeHidden=false explícito: /reports/me é sempre listagem "limpa".
      return (await this.reportsService.findAll(false)).reports;
    }
    const allowedIds = [...await this.permissions.getAllowedReportIds(user)];
    return this.reportsService.findManyByReportIds(allowedIds);
  };

  @Get(':reportId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar relatório pelo ID do Power BI',
    description: 'Retorna os dados de um relatório a partir do seu ID no Power BI (`reportIdPB`), incluindo a URL de embed e a conta associada. Verifica se o usuário autenticado tem permissão de acesso ao relatório. Acessível para os papéis USER e MANAGER.',
  })
  @ApiParam({ name: 'reportId', description: 'ID do relatório no Power BI (reportIdPB)', example: '6e277bac-97e4-43cc-ad65-b96dbdd65f57' })
  @ApiOkResponse({ description: 'Relatório encontrado com sucesso.', type: ReportResponseDto })
  @ApiNotFound('Relatório não encontrado ou sem permissão de acesso.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard, ReportAccessGuard)
  @Roles(ROLE_TYPES.USER, ROLE_TYPES.MANAGER)
  async findOne(@Req() req: Request, @Param('reportId') reportId: string,) {
    const email = req.user.email;
    const report = await this.reportsService.findOne(reportId, email);
    this.events.trackReportView(buildActor(req), reportId);
    return report
  };

  @Delete('delete/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Excluir relatório pelo ID',
    description: 'Remove permanentemente um relatório do banco local pelo seu ID MongoDB. Não afeta o relatório no Power BI. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do relatório a ser excluído', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Relatório excluído com sucesso.' })
  @ApiNotFound('Relatório não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  };

  @Patch('hide/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ocultar relatório da listagem (soft-hide)',
    description: 'Oculta um relatório da listagem sem removê-lo do Power BI. Requer permissão de manager. Registra o email do manager que ocultou e o timestamp. O sync preserva o flag reaplicando-o após repopular.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do relatório a ser ocultado', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Relatório ocultado com sucesso.', type: ReportResponseDto })
  @ApiNotFound('Relatório não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async hide(@Req() req: Request, @Param('id') id: string) {
    const user: any = req.user;
    const email: string = user?.email ?? 'unknown';
    return this.reportsService.hide(id, email);
  };

  @Patch('unhide/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Restaurar relatório ocultado',
    description: 'Restaura um relatório previamente ocultado. Requer permissão de manager. Idempotente.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do relatório a ser restaurado', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Relatório restaurado com sucesso.', type: ReportResponseDto })
  @ApiNotFound('Relatório não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async unhide(@Param('id') id: string) {
    return this.reportsService.unhide(id);
  };
}

function buildActor(req: Request): EventActor {
  const user: any = req.user || {};
  return {
    userId: user.id || user._id?.toString(),
    email: user.email,
    role: user.role,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}
