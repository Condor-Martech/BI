import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SendMailWelcomeProducer } from '../../core/jobs/sendMailWelcome-producer';
import { SendMailResetProducer } from '../../core/jobs/sendMailResetPass-producer';
import { UserGroupDocument, UserGroups } from '../user-groups/user-group.entity';
import { Filter, FilterDocument } from '../filters/entities/filter.entity';
import { CreateUserDto, UserResponseDto } from './dto/create-user.dto';
import { Account, AccountDocument } from '../accounts/account.entity';
import { LoginLogService } from './../login-log/login-log.service';
import { Report, ReportDocument } from '../reports/report.entity';
import { Group, GroupsDocument } from '../groups/group.entity';
import { Authenticator } from '../../core/utils/authenticator';
import { AccountsService } from '../accounts/accounts.service';
import { HashManager } from '../../core/utils/hash.manager';
import { Model, Error as MongooseError } from 'mongoose';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { User, UserDocument } from './user.entity';
import { InjectModel } from '@nestjs/mongoose';
import { EventsService } from '../events/events.service';
import { debug } from 'console';

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(Account.name) private accountModel: Model<AccountDocument>,
    @InjectModel(Filter.name) private filterModel: Model<FilterDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupsDocument>,
    @InjectModel(UserGroups.name) private userGroupModel: Model<UserGroupDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly sendMailResetProducer: SendMailResetProducer,
    private readonly welcomeQueue: SendMailWelcomeProducer,
    private readonly authenticator: Authenticator,
    private readonly accountService: AccountsService,
    private readonly loginLog: LoginLogService,
    private readonly hashManager: HashManager,
    private readonly events: EventsService,

  ) { }

  async create(
    createUserDto: CreateUserDto,
    accountId?: string,
  ): Promise<{ user: UserDocument; access_token: string; welcomeEmailQueued: boolean }> {
    let newUser: UserDocument;
    let rawToken: string;
    try {
      // Token de convite: o usuário define a própria senha em /set-password.
      // Persistimos só o hash bcrypt; o token cru viaja apenas no email.
      rawToken = randomBytes(32).toString('hex');
      const invitationTokenHash = await this.hashManager.hash(rawToken);
      const invitationExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);

      // password fica indefinida — o login fica bloqueado até o usuário aceitar o convite.
      const { password: _ignoredPassword, ...rest } = createUserDto;
      const user = new this.userModel({
        ...rest,
        invitationTokenHash,
        invitationExpiresAt,
      });

      if (accountId) {
        const account = await this.accountService.findAccountById(accountId);
        const userCount = await this.accountService.getUserCount(accountId);
        if (userCount >= Number(process.env.USER_LIMIT)) {
          throw new ConflictException('A conta BI atingiu limite de usuario');
        }
        user.accountID = account._id;
        await this.accountService.addUserId(user._id, account._id);
      }

      newUser = await user.save();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof MongooseError.ValidationError) {
        throw new BadRequestException(error.message);
      }
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictException('Email já cadastrado');
      }
      throw new InternalServerErrorException(
        (error as Error)?.message ?? 'Erro ao criar usuário',
      );
    }

    // Enqueue do convite: separado do create por design — Redis e Mongo não são atômicos.
    // Se o enqueue falhar, o user já está em Mongo, e o admin pode reenviar com
    // POST /users/:id/resend-welcome. Não derrubamos o create por isso.
    const access_token = this.authenticator.generate({
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
    });
    const welcomeEmailQueued = await this.enqueueWelcome(newUser, rawToken);
    return { user: newUser, access_token, welcomeEmailQueued };
  }

  private async enqueueWelcome(user: UserDocument, rawToken: string): Promise<boolean> {
    try {
      await this.welcomeQueue.sendMailWelcome({
        name: user.name,
        email: user.email,
        token: rawToken,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao enfileirar welcome email para userId=${user._id}: ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );
      return false;
    }
  }
  async findUserByEmail(email: string): Promise<UserDocument> {
    return this.userModel.findOne({ email });
  }
  async getBiAccountId(email: string): Promise<string> {
    const account = await this.accountService.findAccountByEmail(email);
    return account._id;
  };
  async logon(loginUserDto: LoginUserDto): Promise<UserResponseDto> {
    try {
      const userFromDB = await this.findUserByEmail(loginUserDto.email);
      if (!userFromDB) {
        throw new UnauthorizedException(`Nenhum usuário encontrado com email: ${loginUserDto.email}`);
      }

      const result = await this.hashManager.compare(loginUserDto.password, userFromDB.password);
      if (!result) {
        throw new UnauthorizedException('Credenciais de acesso inválidas');
      }

      const token = this.authenticator.generate({ id: userFromDB.id, email: userFromDB.email, role: userFromDB.role });
      const user = await this.findOne(userFromDB.id);
      await this.loginLog.registerLoginLog(userFromDB.id);
      this.events.trackLoginSuccess({
        userId: userFromDB.id,
        email: userFromDB.email,
        role: userFromDB.role,
      });

      return {
        access_token: token,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userIslv: user.userIslv,
        accountID: user.accountID,
        groupByPB: user.groupByPB,
        reportsByPB: user.reportsByPB,
      };

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }

  async setToken(islv: string): Promise<UserResponseDto> {
    try {
      const db = await this.userModel.findOne({ 'userIslv': islv });
      if (!db) {
        throw new UnauthorizedException(`Nenhum usuário encontrado com esse número de cracha: ${islv}`);
      }

      const token = this.authenticator.generate({ id: db._id, email: db.email, role: db.role });
      await this.loginLog.registerLoginLog(db._id);
      this.events.trackLoginSuccess({
        userId: db._id?.toString(),
        email: db.email,
        role: db.role,
      });
  
      return {
        access_token: token,
        id: db._id,
        name: db.name,
        email: db.email,
        role: db.role,
        userIslv: db.userIslv,
        accountID: db.accountID,
        groupByPB: db.groupByPB,
        reportsByPB: db.reportsByPB,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }


  async findAll(query: ListUsersDto = {}) {
    const filter: Record<string, any> = {};

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ name: rx }, { email: rx }, { userIslv: rx }];
    }

    if (query.role) {
      filter.role = query.role;
    }

    if (query.lastLoginFrom || query.lastLoginTo) {
      filter.lastLogin = {};
      if (query.lastLoginFrom) filter.lastLogin.$gte = new Date(query.lastLoginFrom);
      if (query.lastLoginTo) filter.lastLogin.$lte = new Date(query.lastLoginTo);
    }

    // Lista MANAGER: campos que a tabela/edição usam (name, email, role,
    // userIslv, lastLogin, accountID, chatIaEnabled) + reportsByPB/groupByPB,
    // necessários para a tela de Permissões pré-marcar os relatórios já salvos
    // do usuário (sem eles, a seleção se "perdia" após salvar). + _id implícito.
    // Exclui password (leak), userGroups e filterId (não usados aqui).
    // accountID é populado apenas com nameAccount + email para a coluna
    // "E-mail da conta" (sem token, que é sensível).
    return this.userModel
      .find(filter)
      .select('name email role userIslv lastLogin accountID chatIaEnabled reportsByPB groupByPB')
      .populate({ path: 'accountID', select: 'nameAccount email', model: this.accountModel })
      .exec();
  };
  async findOne(id: string): Promise<any> {
    try {
      const result: any = await this.userModel.findById(id)
        .populate({
          path: 'accountID',
          select: 'nameAccount email token',
          model: this.accountModel
        })
        .populate({
          path: 'group',
          select: 'name groupID',
          model: this.groupModel
        })
        .populate({
          path: 'filterId',
          select: 'table column value',
          model: this.filterModel
        })
        .populate({
          path: 'report',
          select: 'reportID name embedUrl groupIdPB',
          model: this.reportModel
        });

      if (!result) {
        throw new NotFoundException(`User com ID ${id} não encontrado`);
      }

      const user = {
        id: result._id,
        name: result.name,
        role: result.role,
        email: result.email,
        // Necessário para o front gatear o sidebar de Análise com IA (GET /users = "me").
        chatIaEnabled: result.chatIaEnabled ?? false,
        accountID: result.accountID && result.accountID.length > 0 ? result.accountID.map(a => ({
          id: a._id,
          nameAccount: a.nameAccount,
          email: a.email,
          token: a.token,
        })) : null,
        group: result.group && result.group.length > 0 ? {
          name: result.group[0].name,
          groupID: result.group[0].groupID
        } : null,
        report: result.report && result.report.length > 0 ? result.report.map(r => ({
          id: r._id,
          reportIdPB: r.reportIdPB,
          name: r.name,
          embedUrl: r.embedUrl,
          groupIdPB: r.groupIdPB
        })) : [],
        filterId: result.filterId && result.filterId.length > 0 ? result.filterId.map(f => ({
          table: f.table,
          column: f.column,
          value: f.value
        })) : null
      };

      return user;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      };
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`User with ID ${id} not found: ${error.message}`);
      };
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  };

  async findOneByUserID(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User com ID ${userId} não encontrado`);
    }
    return user;
  }

  async findByAccountId(accountID: string) {
    const users = await this.userModel.find({ accountID });
    if (users.length > 0) {
      throw new ConflictException(`Conta possui usuários ${users.length} cadastrados`);
    }
  };
// <<<<<<< HEAD
  async addUserToGroup(userId: string, groupId: string): Promise<User> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException(`User com ID ${userId} não encontrado`);
      }


      const userGroup = await this.userGroupModel.findById(groupId);
      if (!userGroup) {
        throw new NotFoundException(`UserGroup com ID ${groupId} não encontrado`);
      }

      // Membresía de um único grupo: se o usuário já estava em outro grupo, removê-lo de lá.
      if (user.userGroups && String(user.userGroups) !== String(userGroup._id)) {
        await this.userGroupModel.findByIdAndUpdate(
          user.userGroups,
          { $pull: { users: userId } }
        );
      }

      await this.userGroupModel.findByIdAndUpdate(
        userGroup._id,
        { $addToSet: { users: userId } }
      );
      user.userGroups = userGroup._id;
      // Os relatórios do grupo NÃO são copiados: são resolvidos em tempo real por PermissionsService.

      await user.save();
      return user;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }


  async incluedAccountID(userId: string, accountId: string): Promise<any> {
    try {
      const account = await this.accountModel.findById(accountId);
      if (!account) {
        throw new NotFoundException('Conta não encontrada');
      }
      const userCount = await this.accountService.getUserCount(accountId);
      if (userCount < Number(process.env.USER_LIMIT)) {
        await this.accountModel.findOneAndUpdate({ _id: accountId }, { $addToSet: { users: userId } }, { new: true });
        return await this.userModel.findByIdAndUpdate(
          { _id: userId },
          { $addToSet: { accountID: accountId }, },
          { new: true })
      } else {
        throw new ConflictException('A conta BI atingiu limite de usuario');
      }
    } catch (error) {
      throw new ConflictException(error.message);
    }
  };
  async incluedNewAccountID(userId: string, accountId: string): Promise<any> {
    try {
      const account = await this.accountModel.findById(accountId);
      if (!account) {
        throw new NotFoundException('Conta não encontrada')
      }
      await this.accountModel.findOneAndUpdate({ _id: accountId }, { $addToSet: { users: userId } }, { new: true });
      return await this.userModel.findByIdAndUpdate(
        { _id: userId },
        { $addToSet: { accountID: accountId }, },
        { new: true })

    } catch (error) {
      throw new InternalServerErrorException(error.message);
// =======
//   async incluedAccountID(id: string, accountId: string): Promise<any> {
//     const account = await this.accountModel.findById(accountId);
//     if (account.userCount < Number(process.env.USER_LIMIT)) {
//       await this.accountModel.findByIdAndUpdate({ _id: account._id }, { $inc: { userCount: 1 } }, { $currentDate: { lastModified: true } });
//       return await this.userModel.findByIdAndUpdate({
//         _id: id,
//       }, {
//         $push: { accountId },
//       }, {
//         $currentDate: { lastModified: true }
//       })
//     } else {
//       throw new HttpException('A conta BI atingiu limite de usuario', HttpStatus.CONFLICT);
// >>>>>>> parent of 071e683 (Correções em AccountService and UserService)
    }
  };
  async incluedFilter(id: string, filterId: any): Promise<any> {
    return await this.userModel.findByIdAndUpdate({
      _id: id,
    }, {
      $addToSet: { filterId },
    }, {
      $currentDate: { lastModified: true }
    })
  };
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const updated = await this.userModel.findByIdAndUpdate(
      id,
      { $set: updateUserDto },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    return updated;
  };
  // Troca a conta BI do usuário: remove de todas as contas atuais e vincula à
  // conta de destino, mantendo os dois lados da relação (user.accountID e
  // account.users) em sincronia. Reaproveita removeUserFromAccount + incluedAccountID.
  async changeUserAccount(userId: string, accountId: string): Promise<User> {
    const user = await this.userModel.findById(userId).select('accountID');
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

    // accountID pode vir como ObjectId ou documento populado — normaliza para string.
    const current = (user.accountID ?? []).map((a: any) => String(a?._id ?? a));
    const target = String(accountId);
    const alreadyLinked = current.includes(target);

    // Remove de todas as contas atuais que não sejam a de destino.
    for (const accId of current) {
      if (accId === target) continue;
      await this.accountService.removeUserFromAccount(accId, userId);
    }

    // Vincula à conta de destino (valida USER_LIMIT e sincroniza os dois lados).
    // Se já estava vinculado, não revalida o limite — apenas mantém o vínculo.
    if (!alreadyLinked) {
      await this.incluedAccountID(userId, target);
    }

    return this.findOne(userId);
  };
  async updateUserReports(userId: string, reportIds: string[], groupIds: string[]): Promise<User> {
    try {
      const validReports = await this.reportModel.find({ reportIdPB: { $in: reportIds } });
      if (validReports.length !== reportIds.length) {
        throw new NotFoundException(`One or more ReportIDs not found`);
      }

      const user = await this.userModel.findByIdAndUpdate(
        userId,
        {
          groupByPB: groupIds,
          reportsByPB: reportIds,
        },
        {
          new: true,
        }
      );

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }
  async updatePass(email: string): Promise<any> {
    const pass = this.hashManager.generatePassword();
    const passHash = await this.hashManager.hash(pass);
    const newPass = await this.userModel.findOneAndUpdate(
      { email: email },
      { $set: { password: passHash } },
      { $currentDate: { lastModified: true } }
    );
    if (newPass) {
      newPass.password = pass
      this.sendMailResetProducer.sendMailResetPass(newPass);
    };
    const result = await this.userModel.find({ email });
    return result;
  };

  async setPassword(dto: SetPasswordDto): Promise<UserResponseDto> {
    // Candidatos: users com convite ainda vigente. Conjunto pequeno (onboardings das últimas 48h).
    // Se o volume crescer, indexar por prefixo do token (primeiros N chars como lookup key).
    const candidates = await this.userModel
      .find({
        invitationTokenHash: { $exists: true, $ne: null },
        invitationExpiresAt: { $gt: new Date() },
      })
      .exec();

    let matched: UserDocument | null = null;
    for (const candidate of candidates) {
      const ok = await this.hashManager.compare(dto.token, candidate.invitationTokenHash);
      if (ok) {
        matched = candidate;
        break;
      }
    }
    if (!matched) {
      throw new UnauthorizedException('Convite inválido ou expirado');
    }

    matched.password = await this.hashManager.hash(dto.password);
    matched.invitationTokenHash = undefined;
    matched.invitationExpiresAt = undefined;
    await matched.save();

    const access_token = this.authenticator.generate({
      id: matched._id,
      email: matched.email,
      role: matched.role,
    });
    await this.loginLog.registerLoginLog(matched._id);

    return {
      access_token,
      id: matched._id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
      userIslv: matched.userIslv,
      accountID: matched.accountID,
      groupByPB: matched.groupByPB,
      reportsByPB: matched.reportsByPB,
    };
  }

  async resendWelcome(userId: string): Promise<{ message: string; welcomeEmailQueued: boolean }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User com ID ${userId} não encontrado`);
    }
    // Se já definiu senha, o caminho correto é /users/forget/pass/:email — não reenviamos convite.
    if (user.password) {
      throw new ConflictException(
        'Usuário já definiu senha. Use o fluxo de redefinição de senha.',
      );
    }

    const rawToken = randomBytes(32).toString('hex');
    user.invitationTokenHash = await this.hashManager.hash(rawToken);
    user.invitationExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await user.save();

    const welcomeEmailQueued = await this.enqueueWelcome(user, rawToken);
    return {
      message: welcomeEmailQueued
        ? 'Convite reenviado com sucesso'
        : 'Falha ao enfileirar o convite — verifique a fila',
      welcomeEmailQueued,
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.findOneByUserID(userId);

    const matches = await this.hashManager.compare(changePasswordDto.currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    if (changePasswordDto.currentPassword === changePasswordDto.newPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual');
    }

    user.password = await this.hashManager.hash(changePasswordDto.newPassword);
    await user.save();

    return { message: 'Senha alterada com sucesso' };
  };
  async remove(id: string): Promise<any> {
    return await this.userModel
      .deleteOne({
        _id: id,
      }).exec();
  };
}
