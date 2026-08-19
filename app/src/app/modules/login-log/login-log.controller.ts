import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiCommonResponses, ApiNotFound } from '../../core/api/swagger/api.response';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { RolesGuard } from '../../core/auth/roles.guard';
import { ROLE_TYPES } from '../users/dto/create-user.dto';
import { LoginLogsResponseDto, LoginLogUserSummaryDto } from './login-log.dto';
import { LoginLogService } from './login-log.service';
import { Request } from 'express';


@ApiTags('Login-Log')
@Controller('login-log')
export class LoginLogController {
  constructor(
    private readonly loginLogService: LoginLogService,
  ) { }

  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar todos os registros de login',
    description: 'Retorna o histórico completo de logins de todos os usuários. Restrito a MANAGER.',
  })
  @ApiOkResponse({ description: 'Lista de registros de login retornada com sucesso.', type: [LoginLogsResponseDto] })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findAll(@Req() req: Request) {
    return await this.loginLogService.findAll();
  }

  @Get('resumo-usuarios')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resumo de logins por usuário',
    description:
      'Retorna UMA linha por usuário cadastrado com contagem de logins (accesos) e último acesso (ultimoAcceso). Inclui usuários que nunca logaram (accesos: 0, ultimoAcceso: null). Restrito a MANAGER.',
  })
  @ApiOkResponse({ description: 'Resumo por usuário retornado com sucesso.', type: [LoginLogUserSummaryDto] })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findUsersSummary() {
    return await this.loginLogService.findUsersSummary();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar registros de login por ID do usuário',
    description: 'Retorna os registros de login associados ao usuário identificado pelo ID. Restrito a MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Registros de login do usuário retornados com sucesso.', type: [LoginLogsResponseDto] })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async findOne(@Param('id') id: string) {
    return await this.loginLogService.findOne(id);
  }

}
