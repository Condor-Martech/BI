import { Controller, Get, Post, Body, Patch, Param, Delete, Inject, forwardRef, Req, UseInterceptors, UseGuards, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, Query, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateUserDto, ROLE_TYPES, UserResponseDto, UserResponseWithPopulateDto } from './dto/create-user.dto';
import { ApiCommonResponses, ApiNotFound } from '../../core/api/swagger/api.response';
import { SentryInterceptor } from '../../core/sentry/sentry.interceptor';
import { SkipAuth } from '../../core/auth/skip-auth.decorator';
import { Roles } from '../../core/auth/roles-auth.decorator';
import { ReportsService } from '../reports/reports.service';
import { JwtAuthGuard } from '../../core/auth/auth.guard';
import { RolesGuard } from '../../core/auth/roles.guard';
import { AdminAllowlistGuard } from '../../core/auth/admin-allowlist.guard';
import { SuperAdminGuard } from '../../core/auth/super-admin.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeUserAccountDto } from './dto/change-user-account.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { AdminResetPasswordDto, AdminResetPasswordResponseDto } from './dto/admin-reset-password.dto';
import { AdminImpersonateDto, AdminImpersonateResponseDto } from './dto/admin-impersonate.dto';
import { UsersService } from './users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-log/audit-log.constants';
import { Request } from "express";


@ApiTags('Users')
@UseInterceptors(SentryInterceptor)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly report: ReportsService,
    private readonly auditLog: AuditLogService,
  ) { }
  @Post('create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN)
  @ApiOperation({
    summary: 'Criação de novo usuário',
    description: 'Registra um novo usuário. Requer token de um ADMIN ou MANAGER. Apenas um MANAGER pode criar usuários com role manager ou admin.',
  })
  @ApiCreatedResponse({ description: 'Usuário criado com sucesso.', type: UserResponseDto })
  @ApiCommonResponses()
  async create(@Req() req: Request, @Body() createUserDto: CreateUserDto): Promise<any> {
    const caller = req.user;
    const elevated = createUserDto.role === ROLE_TYPES.MANAGER || createUserDto.role === ROLE_TYPES.ADMIN;
    if (elevated && caller.role !== ROLE_TYPES.MANAGER) {
      throw new ForbiddenException('Apenas um MANAGER pode criar usuários manager/admin');
    }

    const userFromDB = await this.usersService.findUserByEmail(createUserDto.email);
    if (userFromDB) {
      throw new UnauthorizedException(`O email: ${createUserDto.email} está em uso`);
    }

    let accountId: string;
    if (createUserDto.role === ROLE_TYPES.USER) {
      if (!createUserDto.accountUser) {
        throw new BadRequestException("Necessário informar o email da conta BI");
      }
      accountId = await this.usersService.getBiAccountId(createUserDto.accountUser);
      if (!accountId) {
        throw new NotFoundException("Conta BI não encontrada");
      }
    }
    const { user, access_token, welcomeEmailQueued } = await this.usersService.create(createUserDto, accountId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountID: user.accountID,
      groupByPB: user.groupByPB,
      reportsByPB: user.reportsByPB,
      access_token,
      // Sinaliza ao frontend se o convite foi enfileirado. Se for false, oferecer "reenviar".
      welcomeEmailQueued,
    };
  }

  @Post('login')
  @SkipAuth()
  @ApiOperation({
    summary: 'Login do usuário',
    description: 'Autentica o usuário com email e senha e retorna o JWT de acesso junto aos dados do perfil.',
  })
  @ApiOkResponse({ description: 'Usuário autenticado com sucesso. Retorna dados do perfil e access_token JWT.', type: UserResponseDto })
  @ApiCommonResponses()
  async login(@Body() loginUserDto: LoginUserDto): Promise<UserResponseDto> {
    try {
      const logon = await this.usersService.logon(loginUserDto);
      return logon;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Requisição inválida');
    }
  }

  @SkipAuth()
  @Get('token/:islv')
  @ApiOperation({
    summary: 'Gerar token por código islv',
    description: 'Retorna um token de acesso a partir de um código islv externo. Endpoint público, não requer autenticação.',
  })
  @ApiParam({ name: 'islv', description: 'Código islv do usuário externo', example: 'ABC123' })
  @ApiOkResponse({ description: 'Token gerado com sucesso.' })
  async setToken(@Param('islv') islv: string) {
    try {
      return await this.usersService.setToken(islv);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Requisição inválida');
    }
  }

  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar todos os usuários',
    description: 'Retorna a lista de usuários cadastrados, opcionalmente filtrada por busca textual, role e janela de último login. Restrito a MANAGER.',
  })
  @ApiOkResponse({ description: 'Lista de usuários retornada com sucesso.', type: [UserResponseWithPopulateDto] })
  @ApiCommonResponses()
  @Roles(ROLE_TYPES.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findAll(@Query() query: ListUsersDto) {
    const users = await this.usersService.findAll(query);
    return users;
  }

  @Get('')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar perfil do usuário autenticado',
    description: 'Retorna os dados do usuário identificado pelo JWT no header Authorization. Acessível a todos os roles.',
  })
  @ApiOkResponse({ description: 'Dados do usuário autenticado retornados com sucesso.', type: UserResponseWithPopulateDto })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.USER, ROLE_TYPES.ADMIN)
  async findOne(@Req() req: Request) {
    const user = req.user;
    const userFromDB = await this.usersService.findOne(user.id);
    return userFromDB;
  }

  @Get('id/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buscar usuário por ID',
    description: 'Retorna os dados completos de um usuário específico a partir do seu ID MongoDB. Restrito a MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Usuário encontrado com sucesso.', type: UserResponseWithPopulateDto })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  @Roles(ROLE_TYPES.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findOneByID(@Param('id') id: string) {
    const userFromDB = await this.usersService.findOne(id);
    return userFromDB;
  }

  @Patch('inclued/account/:email')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Incluir conta BI no usuário',
    description: 'Vincula a conta Power BI identificada pelo email ao usuário autenticado pelo token.',
  })
  @ApiParam({ name: 'email', description: 'Email da conta BI a ser vinculada', example: 'conta@empresa.com' })
  @ApiOkResponse({ description: 'Conta BI vinculada com sucesso. Retorna o perfil atualizado do usuário.', type: UserResponseWithPopulateDto })
  @ApiNotFound('Conta BI não encontrada.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.USER, ROLE_TYPES.MANAGER)
  async updateAccountIDs(@Param('email') email: string, @Req() req: Request) {
    const user = req.user;
    const accountId = await this.usersService.getBiAccountId(email);
    await this.usersService.incluedAccountID(user.id, accountId);
    return await this.usersService.findOne(user.id);
  }

  @Patch(':userId/group/:groupId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Adicionar usuário a um grupo',
    description: 'Vincula o usuário indicado pelo userId ao grupo de usuários indicado pelo groupId. Restrito a MANAGER.',
  })
  @ApiParam({ name: 'userId', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiParam({ name: 'groupId', description: 'ID MongoDB do grupo de usuários', example: '6685a57d6dddeaa56c4a5f99' })
  @ApiOkResponse({ description: 'Usuário vinculado ao grupo com sucesso.' })
  @ApiNotFound('Usuário ou grupo não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async updateUserGroup(@Param('userId') userId: string, @Param('groupId') groupId: string) {
    const update = await this.usersService.addUserToGroup(userId, groupId);
    return update;
  }

  @Patch(':id/account')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Trocar a conta BI de um usuário',
    description: 'Remove o usuário de suas contas BI atuais e o vincula à conta informada, mantendo os dois lados da relação em sincronia. Restrito a MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Conta BI do usuário trocada com sucesso. Retorna o perfil atualizado.' })
  @ApiNotFound('Usuário ou conta BI não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async changeAccount(@Param('id') id: string, @Body() dto: ChangeUserAccountDto) {
    return this.usersService.changeUserAccount(id, dto.accountId);
  }

  @Patch('update/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Atualizar dados de um usuário',
    description: 'Atualiza os dados de um usuário identificado pelo ID. Apenas os campos enviados no body são alterados. Restrito ao papel MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário a ser atualizado', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Dados do usuário atualizados com sucesso.' })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const update = await this.usersService.update(id, updateUserDto);
    return update;
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Alterar a própria senha',
    description: 'Permite ao usuário autenticado alterar sua própria senha, informando a senha atual e a nova senha.',
  })
  @ApiOkResponse({ description: 'Senha alterada com sucesso.' })
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN, ROLE_TYPES.USER)
  async changePassword(@Req() req: Request, @Body() changePasswordDto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.id, changePasswordDto);
  }

  @Patch(':userId/reports')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Atualizar relatórios do usuário',
    description: 'Substitui a lista de relatórios (reportsByPB) e grupos (groupIdPB) vinculados ao usuário. Os grupos são derivados automaticamente dos relatórios informados.',
  })
  @ApiParam({ name: 'userId', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Relatórios do usuário atualizados com sucesso.' })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async updateGroupAndReport(@Param('userId') userId: string, @Body() updateUserDto: UpdateUserDto) {
    const groupsId = await this.report.filterGroups(updateUserDto.reportIdPB);
    updateUserDto.groupIdPB = groupsId;
    const update = await this.usersService.updateUserReports(userId, updateUserDto.reportIdPB, updateUserDto.groupIdPB);
    return update;
  }

  @Post('set-password')
  @SkipAuth()
  @ApiOperation({
    summary: 'Definir senha via convite',
    description: 'Endpoint público. Valida o token de convite recebido por email e define a senha do usuário. Retorna o JWT de acesso.',
  })
  @ApiOkResponse({ description: 'Senha definida com sucesso. Retorna access_token + perfil.', type: UserResponseDto })
  async setPassword(@Body() setPasswordDto: SetPasswordDto): Promise<UserResponseDto> {
    return this.usersService.setPassword(setPasswordDto);
  }

  @Post(':id/resend-welcome')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER, ROLE_TYPES.ADMIN)
  @ApiOperation({
    summary: 'Reenviar convite de boas-vindas',
    description: 'Gera um novo token de convite e re-enfileira o email. Falha com 409 se o usuário já definiu senha (nesse caso, use o reset de senha).',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Convite reenviado (ou enfileirado).' })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  async resendWelcome(@Param('id') id: string) {
    return this.usersService.resendWelcome(id);
  }

  @Patch('forget/pass/:email')
  @SkipAuth()
  @ApiOperation({
    summary: 'Reset de senha',
    description: 'Gera uma nova senha aleatória e a envia ao email informado. Endpoint público, não requer autenticação.',
  })
  @ApiParam({ name: 'email', description: 'Email cadastrado do usuário', example: 'usuario@empresa.com' })
  @ApiOkResponse({ description: 'Nova senha enviada para o email informado.' })
  @ApiNotFound('Nenhum usuário encontrado com o email informado.')
  async resetPassword(@Param('email') email: string) {
    const emailFromDB = await this.usersService.findUserByEmail(email);
    if (!emailFromDB) {
      throw new NotFoundException(`Nenhum usuário encontrado com email: ${email}`);
    }
    await this.usersService.updatePass(emailFromDB.email);
    return { message: 'Sua nova senha foi enviada para seu email' };
  }

  @Post('admin/reset-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminAllowlistGuard)
  @ApiOperation({ summary: 'Reset da senha de um usuário (admin) — retorna a nova senha em texto plano' })
  @ApiOkResponse({ type: AdminResetPasswordResponseDto })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async adminResetPassword(
    @Req() req: Request,
    @Body() dto: AdminResetPasswordDto,
  ): Promise<AdminResetPasswordResponseDto> {
    const actor = (req as any).user;
    const result = await this.usersService.adminResetPassword(dto.email, dto.length);
    this.auditLog.emit({
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_BY_ADMIN,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: null,
      actor: { userId: String(actor.id), email: actor.email, role: actor.role },
      metadata: { targetEmail: dto.email },
    });
    return result;
  }

  @Post('admin/impersonate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminAllowlistGuard)
  @ApiOperation({ summary: 'Gera um JWT temporário (1h) para o admin ver o sistema como outro usuário' })
  @ApiOkResponse({ type: AdminImpersonateResponseDto })
  @Header('Cache-Control', 'no-store')
  async adminImpersonate(
    @Req() req: Request,
    @Body() dto: AdminImpersonateDto,
  ): Promise<AdminImpersonateResponseDto> {
    const actor = (req as any).user;
    if (String(actor.email).toLowerCase() === dto.email.toLowerCase()) {
      throw new BadRequestException('Você não pode impersonar a si mesmo');
    }
    const result = await this.usersService.adminGenerateImpersonationToken(dto.email);
    this.auditLog.emit({
      action: AUDIT_ACTIONS.USER_IMPERSONATED,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: null,
      actor: { userId: String(actor.id), email: actor.email, role: actor.role },
      metadata: { targetEmail: dto.email, tokenExp: result.exp },
    });
    return result;
  }

  @Get('admin/allowlist/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, AdminAllowlistGuard)
  @ApiOperation({ summary: 'Verifica se o usuário atual está autorizado para ferramentas admin' })
  async allowlistMe(): Promise<{ allowed: true }> {
    return { allowed: true };
  }

  @Get('admin/allowlist')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Lista usuários com acesso a ferramentas admin (super admin only)' })
  async allowlistList(): Promise<{ items: Array<{ id: string; email: string; name: string; role: string }> }> {
    const items = await this.usersService.allowlistList();
    return { items };
  }

  @Post('admin/allowlist')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Dá acesso admin a um usuário existente (super admin only)' })
  async allowlistAdd(
    @Req() req: Request,
    @Body() dto: AdminImpersonateDto,
  ): Promise<{ ok: true }> {
    const actor = (req as any).user;
    await this.usersService.allowlistAdd(dto.email);
    this.auditLog.emit({
      action: AUDIT_ACTIONS.ADMIN_ALLOWLIST_ADDED,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: null,
      actor: { userId: String(actor.id), email: actor.email, role: actor.role },
      metadata: { targetEmail: dto.email },
    });
    return { ok: true };
  }

  @Delete('admin/allowlist/:email')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Remove o acesso admin de um usuário (super admin only)' })
  async allowlistRemove(
    @Req() req: Request,
    @Param('email') email: string,
  ): Promise<{ ok: true }> {
    const actor = (req as any).user;
    await this.usersService.allowlistRemove(email);
    this.auditLog.emit({
      action: AUDIT_ACTIONS.ADMIN_ALLOWLIST_REMOVED,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: null,
      actor: { userId: String(actor.id), email: actor.email, role: actor.role },
      metadata: { targetEmail: email },
    });
    return { ok: true };
  }

  @Delete('delete/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Deletar usuário',
    description: 'Remove permanentemente o usuário identificado pelo ID. Restrito a MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB do usuário a ser removido', example: '6685a57d6dddeaa56c4a5f15' })
  @ApiOkResponse({ description: 'Usuário removido com sucesso.' })
  @ApiNotFound('Usuário não encontrado.')
  @ApiCommonResponses()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_TYPES.MANAGER)
  async remove(@Param('id') id: string) {
    await this.usersService.findOne(id);
    return this.usersService.remove(id);
  }
}