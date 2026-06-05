import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { ApiCommonResponses } from '../../core/api/swagger/api.response';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { RolesGuard } from '../../core/auth/roles.guard';
import { SentryInterceptor } from '../../core/sentry/sentry.interceptor';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { UserDocument } from '../users/user.entity';
import { MeService } from './me.service';

@ApiTags('Me')
@UseInterceptors(SentryInterceptor)
@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('sidebar')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Árvore de navegação do usuário autenticado',
    description:
      'Retorna contas BI e workspaces visíveis no sidebar. MANAGER e ADMIN veem tudo; USER vê apenas as contas vinculadas em accountID.',
  })
  @ApiOkResponse({ description: 'Lista de contas com workspaces.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN, ROLE_TYPES.USER)
  async getSidebar(@Req() req: Request) {
    return this.meService.getSidebar(req.user as UserDocument);
  }

  @Get('overview')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resumo do dashboard do usuário autenticado',
    description:
      'Contadores para o dashboard: relatórios atribuídos e workspaces acessíveis. USER conta apenas os permitidos (diretos ∪ grupo); MANAGER/ADMIN contam todos.',
  })
  @ApiOkResponse({ description: 'Contadores do dashboard do usuário.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN, ROLE_TYPES.USER)
  async getOverview(@Req() req: Request) {
    return this.meService.getOverview(req.user as UserDocument);
  }

  @Get('reports')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reports acessíveis ao usuário dentro de um workspace do Power BI',
    description:
      'Filtra por `pbWorkspaceId` (groupIdPB). MANAGER/ADMIN veem todos os reports do workspace; USER vê apenas os reports permitidos (diretos ∪ grupo), restritos ao workspace.',
  })
  @ApiQuery({ name: 'pbWorkspaceId', required: true, description: 'Power BI workspace ID (groupIdPB).' })
  @ApiOkResponse({ description: 'Lista de reports do workspace acessíveis ao usuário.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN, ROLE_TYPES.USER)
  async getReports(@Req() req: Request, @Query('pbWorkspaceId') pbWorkspaceId?: string) {
    if (!pbWorkspaceId || typeof pbWorkspaceId !== 'string' || pbWorkspaceId.trim() === '') {
      throw new BadRequestException('pbWorkspaceId is required');
    }
    return this.meService.getReports(req.user as UserDocument, pbWorkspaceId.trim());
  }
}
