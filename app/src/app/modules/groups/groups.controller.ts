import { Controller, Get, Post, Param, Delete, Inject, forwardRef, Req, UseInterceptors, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SentryInterceptor } from '../../core/sentry/sentry.interceptor';
import { AccountsService } from '../accounts/accounts.service';
import { ApiCommonResponses, ApiNotFound } from '../../core/api/swagger/api.response';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { RolesGuard } from '../../core/auth/roles.guard';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { GroupsService } from './groups.service';
import { Request } from 'express';

@ApiTags('Groups')
@UseInterceptors(SentryInterceptor)
@Controller('groups')
export class GroupsController {
  constructor(
    @Inject(forwardRef(() => GroupsService))
    private readonly groupsService: GroupsService,
    private readonly accountsService: AccountsService
  ) { }

  @Post('create')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sincronizar grupos do Power BI',
    description: 'Busca todos os workspaces (grupos) disponíveis no Power BI para a primeira conta vinculada ao usuário autenticado e os persiste no banco local. Restrito ao papel MANAGER.',
  })
  @ApiOkResponse({ description: 'Grupos sincronizados com sucesso.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async createByApi(@Req() req: Request) {
    const user = req.user
    const accountId = user.accountID?.[0];
    if (!accountId) {
      throw new BadRequestException('Usuário não possui conta BI vinculada');
    }
    const account = await this.accountsService.getIdAccount(accountId);
    return this.groupsService.createAllGroupByAccount(account._id);
  };

  @Get('all/:accountId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar grupos de uma conta',
    description: 'Retorna todos os grupos de relatórios (workspaces) vinculados a uma conta BI específica, identificada pelo seu ID. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'accountId', description: 'ID MongoDB da conta BI', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Lista de grupos retornada com sucesso.' })
  @ApiNotFound('Conta não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findAll(@Param('accountId') accountId: string) {
    // findAccountById NO refresca token Azure — listar workspaces es data local de Mongo,
    // no requiere hablar con Power BI. getIdAccount rompía la pantalla de permissões cuando
    // una cuenta tenía credenciales Azure vencidas/rotas, aunque solo se querían leer nombres.
    await this.accountsService.findAccountById(accountId);
    const groups = await this.groupsService.findAllByAccount(accountId);
    return groups;
  };

  @Get('report/:groupIdPB')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar grupo com seus relatórios',
    description: 'Retorna um grupo de relatórios (workspace) pelo ID do Power BI, incluindo todos os relatórios a ele associados. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'groupIdPB', description: 'ID do workspace no Power BI', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiOkResponse({ description: 'Grupo e relatórios retornados com sucesso.' })
  @ApiNotFound('Grupo não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async getReportsByGroup(@Param('groupIdPB') groupIdPB: string) {
    const result = await this.groupsService.findOneAndReports(groupIdPB);
    return result
  };

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar grupo pelo ID',
    description: 'Retorna os dados de um grupo de relatórios (workspace) pelo seu identificador MongoDB. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do grupo', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Grupo encontrado com sucesso.' })
  @ApiNotFound('Grupo não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findOne(@Param('id') id: string) {
    const groupsFromDB = await this.groupsService.findOne(id);
    return groupsFromDB
  };

  @Delete('delete/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Excluir grupo pelo ID',
    description: 'Remove permanentemente um grupo de relatórios (workspace) do banco local pelo seu ID MongoDB. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do grupo a ser excluído', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Grupo excluído com sucesso.' })
  @ApiNotFound('Grupo não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async remove(@Param('id') id: string) {
    await this.groupsService.findOne(id);
    return this.groupsService.remove(id);
  };
}
