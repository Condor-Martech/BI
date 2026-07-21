import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { SendMailWelcomeProducer } from '../src/app/core/jobs/sendMailWelcome-producer';
import { SendMailResetProducer } from '../src/app/core/jobs/sendMailResetPass-producer';
import { JwtAuthGuard } from '../src/app/core/auth/auth.guard';
import { RolesGuard } from '../src/app/core/auth/roles.guard';
import { ChangePasswordDto } from '../src/app/modules/users/dto/change-password.dto';
import { CreateUserDto, ROLE_TYPES } from '../src/app/modules/users/dto/create-user.dto';
import { LoginLogService } from '../src/app/modules/login-log/login-log.service';
import { AccountsService } from '../src/app/modules/accounts/accounts.service';
import { ReportsService } from '../src/app/modules/reports/reports.service';
import { UsersController } from '../src/app/modules/users/users.controller';
import { AuditLogService } from '../src/app/modules/audit-log/audit-log.service';
import { UserGroups } from '../src/app/modules/user-groups/user-group.entity';
import { Authenticator } from '../src/app/core/utils/authenticator';
import { Filter } from '../src/app/modules/filters/entities/filter.entity';
import { HashManager } from '../src/app/core/utils/hash.manager';
import { Account } from '../src/app/modules/accounts/account.entity';
import { UsersService } from '../src/app/modules/users/users.service';
import { Report } from '../src/app/modules/reports/report.entity';
import { Group } from '../src/app/modules/groups/group.entity';
import { User } from '../src/app/modules/users/user.entity';

/**
 * Spec enfocado nos ajustes do sistema de autenticação:
 *  - POST /users/create: somente um MANAGER pode criar usuários manager/admin.
 *  - PATCH /users/change-password: troca da própria senha exige a senha atual correta.
 */
describe('UsersController.create — restrição de role elevado', () => {
  let usersController: UsersController;
  let usersService: jest.Mocked<Pick<UsersService, 'findUserByEmail' | 'getBiAccountId' | 'create'>>;

  beforeEach(async () => {
    usersService = {
      findUserByEmail: jest.fn(),
      getBiAccountId: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: ReportsService, useValue: { filterGroups: jest.fn() } },
        { provide: AuditLogService, useValue: { emit: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    usersController = module.get<UsersController>(UsersController);
  });

  it('um ADMIN pode criar um usuário com role USER', async () => {
    const dto: CreateUserDto = {
      name: 'John Doe',
      email: 'john@example.com',
      role: ROLE_TYPES.USER,
      accountUser: 'bi@example.com',
    };
    const created = { user: { id: 'u1', name: dto.name, email: dto.email, role: dto.role }, access_token: 'tk' };

    usersService.findUserByEmail.mockResolvedValue(null as any);
    usersService.getBiAccountId.mockResolvedValue('accId');
    usersService.create.mockResolvedValue(created as any);

    const req: any = { user: { role: ROLE_TYPES.ADMIN } };
    const result = await usersController.create(req, dto);

    expect(usersService.create).toHaveBeenCalledWith(dto, 'accId');
    expect(result.access_token).toBe('tk');
  });

  it('um ADMIN NÃO pode criar um usuário com role ADMIN (ForbiddenException)', async () => {
    const dto: CreateUserDto = { name: 'Boss', email: 'boss@example.com', role: ROLE_TYPES.ADMIN };
    const req: any = { user: { role: ROLE_TYPES.ADMIN } };

    await expect(usersController.create(req, dto)).rejects.toThrow(ForbiddenException);
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('um MANAGER pode criar um usuário com role MANAGER', async () => {
    const dto: CreateUserDto = { name: 'Boss', email: 'boss@example.com', role: ROLE_TYPES.MANAGER };
    const created = { user: { id: 'm1', name: dto.name, email: dto.email, role: dto.role }, access_token: 'tk' };

    usersService.findUserByEmail.mockResolvedValue(null as any);
    usersService.create.mockResolvedValue(created as any);

    const req: any = { user: { role: ROLE_TYPES.MANAGER } };
    const result = await usersController.create(req, dto);

    expect(usersService.create).toHaveBeenCalledWith(dto, undefined);
    expect(result.role).toBe(ROLE_TYPES.MANAGER);
  });
});

describe('UsersService — fluxos de autenticação', () => {
  let usersService: UsersService;
  const userModelMock = { findById: jest.fn(), findOne: jest.fn() };
  const hashManagerMock = { compare: jest.fn(), hash: jest.fn(), generatePassword: jest.fn() };
  const authenticatorMock = { generate: jest.fn() };
  const loginLogMock = { registerLoginLog: jest.fn() };

  const buildUserDoc = () => ({ password: 'hash-atual', save: jest.fn().mockResolvedValue(true) });
  const mockFindById = (doc: unknown) =>
    userModelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(Account.name), useValue: {} },
        { provide: getModelToken(Filter.name), useValue: {} },
        { provide: getModelToken(Report.name), useValue: {} },
        { provide: getModelToken(Group.name), useValue: {} },
        { provide: getModelToken(UserGroups.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: userModelMock },
        { provide: SendMailResetProducer, useValue: {} },
        { provide: SendMailWelcomeProducer, useValue: {} },
        { provide: Authenticator, useValue: authenticatorMock },
        { provide: AccountsService, useValue: {} },
        { provide: LoginLogService, useValue: loginLogMock },
        { provide: HashManager, useValue: hashManagerMock },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('rejeita com 401 (UnauthorizedException) quando a senha atual está incorreta', async () => {
    mockFindById(buildUserDoc());
    hashManagerMock.compare.mockResolvedValue(false);

    const dto: ChangePasswordDto = { currentPassword: 'errada', newPassword: 'novaSenha123' };

    await expect(usersService.changePassword('u1', dto)).rejects.toThrow(UnauthorizedException);
    expect(hashManagerMock.hash).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando a nova senha é igual à senha atual', async () => {
    mockFindById(buildUserDoc());
    hashManagerMock.compare.mockResolvedValue(true);

    const dto: ChangePasswordDto = { currentPassword: 'mesmaSenha123', newPassword: 'mesmaSenha123' };

    await expect(usersService.changePassword('u1', dto)).rejects.toThrow(BadRequestException);
  });

  it('troca a senha quando a senha atual está correta', async () => {
    const userDoc = buildUserDoc();
    mockFindById(userDoc);
    hashManagerMock.compare.mockResolvedValue(true);
    hashManagerMock.hash.mockResolvedValue('hash-nova');

    const dto: ChangePasswordDto = { currentPassword: 'senhaAtual1', newPassword: 'novaSenha123' };
    const result = await usersService.changePassword('u1', dto);

    expect(hashManagerMock.hash).toHaveBeenCalledWith('novaSenha123');
    expect(userDoc.password).toBe('hash-nova');
    expect(userDoc.save).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Senha alterada com sucesso' });
  });

  it('setToken rejeita com 401 quando o islv não existe (não mascara como 500)', async () => {
    userModelMock.findOne.mockResolvedValue(null);

    await expect(usersService.setToken('cracha-inexistente')).rejects.toThrow(UnauthorizedException);
  });
});
