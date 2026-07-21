import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EncryptionService } from '../../core/utils/encryption.service';
import { RefreshToken } from '../../core/utils/refresh.token.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account, AccountDocument } from './account.entity';
import { User, UserDocument } from '../users/user.entity';
import { Group, GroupsDocument } from '../groups/group.entity';
import { Report, ReportDocument } from '../reports/report.entity';
import { Model, Error as MongooseError } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { stringify } from 'querystring';
import { AxiosError } from 'axios';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectModel(Account.name) private accountModel: Model<AccountDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Group.name) private groupModel: Model<GroupsDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly http: HttpService,
    private readonly refreshToken: RefreshToken
  ) { }

  async create(createAccountDto: CreateAccountDto): Promise<any> {
    try {
      const results = []
      const body = {
        grant_type: process.env.AZURE_GRANT_TYPE,
        scope: process.env.AZURE_SCOPE,
        resource: process.env.AZURE_RESOURCE,
        client_id: createAccountDto.clientId,
        client_secret: createAccountDto.clientSecret,
        username: createAccountDto.email,
        password: createAccountDto.pass,

      };
      const key = process.env.ENCRYPTION_KEY
      const password = this.encryptionService.encryptData(createAccountDto.pass, key);
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      };
      const response = await firstValueFrom(this.http.post(process.env.AZURE_URL, stringify(body), config)
        .pipe(map(res => res.data)));
      results.push(response)
      const newAccount: CreateAccountDto[] = results.map((item: any) => {

        return {
          nameAccount: createAccountDto.nameAccount,
          email: createAccountDto.email,
          pass: password,
          clientId: createAccountDto.clientId,
          clientSecret: createAccountDto.clientSecret,
          tenantId: createAccountDto.tenantId,
          token: item.access_token,
          refreshToken: item.refresh_token,
          expiresIn: item.expires_in,
          expiresOn: item.expires_on
        } as CreateAccountDto

      })
      const account = new this.accountModel(newAccount[0]);
      await account.save();

      await this.registerUserAtAccount(account._id);
      return account;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data ?? error.message);
    }
  };

  async findAllAccounts(): Promise<any> {
    try {
      const accounts = await this.accountModel.find();
      await Promise.all(
        accounts.map(async (account) => {
          const [userCount, groupCount, reportCount] = await Promise.all([
            this.getUserCount(account._id),
            this.getGroupCount(account._id),
            this.getReportCount(account._id),
          ]);
          account.userCount = userCount;
          account.groupCount = groupCount;
          account.reportCount = reportCount;
        }),
      );
      return accounts;
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  };

  async findByExpiresOn(email: string) {
    try {
      const result = await this.accountModel.findOne({ email });
      return result.expiresOn;

    } catch (error) {
      throw new InternalServerErrorException(error.message);

    }
  };
  async getBiAccount(email: string): Promise<any> {
    try {
      const initial = await this.accountModel.findOne({ email });
      if (!initial) {
        throw new NotFoundException(`Account with email: ${email} not found`);
      }
      await this.refreshToken.refresh(email);
      // refresh() puede haber persistido un token nuevo vía getNewAccessToken().update() —
      // `initial` fue capturado antes y tendría el token viejo. Re-leemos post-refresh
      // para no filtrar tokens vencidos a los callers (Power BI responde 401
      // "Access token has expired" al usarlo en el embed).
      const fresh = await this.accountModel.findOne({ email });
      return fresh ?? initial;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Account with email: ${email} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);

    }
  };
  async getIdAccount(id: string): Promise<any> {
    try {
      const initial = await this.accountModel.findOne({ _id: id });
      if (!initial) {
        throw new NotFoundException(`Account with ID ${id} not found`);
      }
      await this.refreshToken.refresh(initial.email);
      // refresh() puede haber persistido un token nuevo vía getNewAccessToken().update() —
      // `initial` fue capturado antes y tendría el token viejo. Re-leemos post-refresh
      // para no filtrar tokens vencidos a los callers (Power BI responde 401
      // "Access token has expired" al usarlo en el embed).
      const fresh = await this.accountModel.findOne({ _id: id });
      return fresh ?? initial;

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  };
  async getRefreshToken(email: string): Promise<any> {
    return await this.accountModel.findOne({ email });
  };

  async getNewAccessToken(email: string) {
    const tokenEndpoint = 'https://login.microsoftonline.com/27cc7714-ecb3-407d-8115-da53f624c6da/oauth2/token';
    const account = await this.getRefreshToken(email);
    if (!account) {
      throw new NotFoundException(`Account with email: ${email} not found`);
    }
    if (!account.refreshToken) {
      throw new ServiceUnavailableException(
        `Conta ${email} sem refresh_token armazenado — recadastre via POST /accounts.`,
      );
    }
    // Body idêntico ao do servidor legado em produção (`server-powerbi`) que
    // funciona há meses. NÃO usar `account.clientSecret`: os valores gravados
    // em Mongo são o Secret ID (GUID), não o Secret Value — Azure devolve
    // AADSTS7000215 "Invalid client secret provided ... not the client secret ID".
    // `AZURE_SCOPE2` já leva o resource embutido; enviar `resource` explícito
    // conflita e não é necessário no endpoint v1.0 quando o scope traz o URL.
    const body = {
      grant_type: process.env.AZURE_GRANT_TYPE2,
      scope: process.env.AZURE_SCOPE2,
      refresh_token: account.refreshToken,
      client_id: account.clientId,
      client_secret: process.env.AZURE_CLIENT_SECRET,
    };
    const config = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    try {
      // pipe(map(res => res.data)) sin catchError: si axios falla, firstValueFrom
      // rechaza con el AxiosError original (con .response, .code, .message) —
      // dejamos que el catch de abajo decida qué HttpException tirar.
      const data = await firstValueFrom(
        this.http.post(tokenEndpoint, stringify(body), config).pipe(map((res) => res.data)),
      );
      const newToken: UpdateAccountDto[] = [
        {
          email,
          token: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          expiresOn: data.expires_on,
        } as UpdateAccountDto,
      ];
      await this.update(newToken);
      return newToken;
    } catch (error) {
      // Refresh de token de Azure caído/inválido = servicio upstream degradado,
      // no error interno nuestro. Devolvemos 503 con contexto útil en logs para
      // que el caller (getBiAccount/getIdAccount) pueda distinguir del 500 real.
      // Cubrimos también los non-Error thrown (ej: throw 'string') por si acaso.
      const axiosErr = error as AxiosError<{ error?: string; error_description?: string }>;
      const azureCode = axiosErr?.response?.data?.error;
      const azureDesc = axiosErr?.response?.data?.error_description;
      const detail = azureDesc ?? azureCode ?? (error as Error)?.message ?? String(error);
      this.logger.error(
        `Falha ao renovar access_token de Azure para ${email}: ${detail}`,
        (error as Error)?.stack,
      );
      throw new ServiceUnavailableException(
        `Não foi possível renovar o token de Azure para ${email}: ${detail}`,
      );
    }
  };

  async addUserId(userId: string, accountId: string) {
    try {
      await this.accountModel.findByIdAndUpdate(
        accountId,
        { $addToSet: { users: userId } }
      );

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  };
  async removeUserFromAccount(accountId: string, userId: string) {
    try {
      // Remover o ID do usuário da entidade account
      await this.accountModel.findByIdAndUpdate(
        accountId,
        { $pull: { users: userId } }
      );

      // Retirar o ID da account na entidade users
      await this.userModel.findByIdAndUpdate(
        userId,
        { $pull: { accountID: accountId } }
      );
      return { message: 'Usuário removido com sucesso' }

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }
  async updateAccount(id: string, updateDto: UpdateAccountDto) {
    try {
      return await this.accountModel.findOneAndUpdate({
        _id: id,
      }, {
        $set: updateDto,
      }, {
        $new: true
      });
    } catch (error) {
      throw new InternalServerErrorException(error.message)
    }

  };  
  async update(updateApiDto: UpdateAccountDto[]) {
    try {
      return await this.accountModel.findOneAndUpdate({
        email: updateApiDto[0].email,
      }, {
        $set: updateApiDto[0],
      }, {
        $new: true
      });
    } catch (error) {
      throw new InternalServerErrorException(error.message)
    }

  };
  async registerUserAtAccount(accountID: string) {
    try {
      await this.accountModel.findByIdAndUpdate({
        _id: accountID
      }, {
        $inc: { userCount: 1 }
      }, {
        $currentDate: { lastModified: true }
      })
    } catch (error) {
      throw new InternalServerErrorException(error.message)
    }
  }
  async addUserToAccount(accountId: string, userId: string) {
    try {
      await this.accountModel.findOneAndUpdate({ _id: accountId }, { $addToSet: { users: userId } }, { new: true });
      return await this.userModel.findByIdAndUpdate(
        { _id: userId },
        { $addToSet: { accountID: accountId }, },
        { new: true })

    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
  async removeAccount(id: string): Promise<any> {
    try {
      const existUsers = await this.userModel.find({ accountID: id });
      if (existUsers.length > 0) {
        throw new ConflictException(`Conta possui usuários ${existUsers.length} cadastrados`);
      }
      await this.accountModel.deleteOne({
        _id: id,
      }).exec();

      return { message: 'Conta excluída com sucesso' }

    } catch (error) {
      throw new InternalServerErrorException(error.message)
    }
  }

  /**
   * Conteo real de usuarios de una cuenta: única fuente de verdad.
   * Se deriva de los documentos User que referencian la cuenta — no del
   * contador denormalizado `userCount` ni del array `account.users`.
   */
  async getUserCount(accountId: string): Promise<number> {
    return this.userModel.countDocuments({ accountID: accountId });
  }

  /**
   * Conteo de workspaces (grupos PBI) cacheados para una cuenta.
   * Ojo: Group.accountId es camelCase con 'd' minúscula (group.entity.ts:16),
   * distinto de Report.accountID y User.accountID que usan 'D' mayúscula.
   */
  async getGroupCount(accountId: string): Promise<number> {
    return this.groupModel.countDocuments({ accountId });
  }

  /**
   * Conteo de relatórios PBI cacheados para una cuenta.
   *
   * IMPORTANTE: NO usar `Report.accountID` como fuente de verdad. Data histórica
   * de esa columna está corrupta — muchos reports quedaron apuntando a la cuenta
   * con la que se corrió el sync original en vez de a la dueña real del workspace.
   * Ejemplo real (2026-07): Postos tiene 4 workspaces y 83 reports por groupIdPB,
   * pero `Report.accountID` los tiene todos apuntando a "BI".
   *
   * La fuente confiable es la relación por `groupIdPB`: contar los reports cuyos
   * workspaces pertenecen a esta cuenta.
   */
  async getReportCount(accountId: string): Promise<number> {
    const groupIds = await this.groupModel.distinct('groupIdPB', { accountId });
    if (groupIds.length === 0) return 0;
    return this.reportModel.countDocuments({ groupIdPB: { $in: groupIds } });
  }

  /**
   * Lookup puro por id: NO refresca el token de Azure.
   * Usar cuando solo necesitás validar existencia o leer metadata local
   * (creación de usuario, asociación, etc). Para llamadas a Power BI usá
   * `getIdAccount` que sí refresca.
   */
  async findAccountById(id: string): Promise<AccountDocument> {
    try {
      const account = await this.accountModel.findById(id);
      if (!account) {
        throw new NotFoundException(`Account with ID ${id} not found`);
      }
      return account;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Lookup puro por email: NO refresca el token de Azure.
   * Equivalente a `getBiAccount` pero sin tocar Microsoft. Usar en flujos
   * que solo necesitan saber que la cuenta existe.
   */
  async findAccountByEmail(email: string): Promise<AccountDocument> {
    const account = await this.accountModel.findOne({ email });
    if (!account) {
      throw new NotFoundException(`Account with email: ${email} not found`);
    }
    return account;
  }
}