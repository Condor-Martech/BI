import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Account, AccountDocument } from '../accounts/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { Group, GroupsDocument } from '../groups/group.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { Model, Error as MongooseError } from 'mongoose';
import { Report, ReportDocument } from './report.entity';
import { CacheService } from '../../core/cache/cache.service';
import { CACHE_NS, CACHE_TTL, CacheKeys } from '../../core/cache/cache.keys';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly cache: CacheService,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<GroupsDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    private readonly accounts: AccountsService,
    private readonly http: HttpService,

  ) { }

  async getAllReportsByGroup(groups: any[], accountId: string) {
    try {
      for (const group of groups) {
        const groupId = group.groupIdPB;

        await this.getReports(groupId, accountId);
      }
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }

  }; async getReports(groupId: string, accountId: string): Promise<void> {
    try {
      const tokenFromDB = await this.accounts.getIdAccount(accountId);
      if (!tokenFromDB || !tokenFromDB.token) {
        throw new NotFoundException(`Token not found for account ID ${accountId}`);
      }

      const url = `${process.env.POWER_BI_BASE_URL}/groups/${groupId}/reports`;
      const response = await this.fetchReportsWithTokenRetry(url, tokenFromDB);

      if (!response || !Array.isArray(response)) {
        throw new InternalServerErrorException('Invalid response from Power BI API');
      }

      const reports: CreateReportDto[] = response.map(item => this.transformToReportDto(item, groupId, accountId));
      await this.createMany(reports);

    } catch (error) {
      this.handleError(error);
    }
  }

  private async fetchReportsWithTokenRetry(url: string, token: any): Promise<any[]> {
    const doGet = (bearer: string) =>
      firstValueFrom(
        this.http.get(url, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${bearer}`,
          },
        }).pipe(map(res => res.data.value)),
      );

    try {
      return await doGet(token.token);
    } catch (err: any) {
      // 401 mid-sync: syncs longos (>55 min) ou revocação Azure entre iterações
      // deixam alguns groups sem reports. Forçamos getNewAccessToken (bypass do
      // threshold 3-min) e reintentamos UMA vez sem consumir attempts do Bull.
      if (err?.response?.status !== 401) throw err;
      this.logger.warn(`401 em ${url} — forçando refresh de token e reintentando`);
      const refreshed: any = await this.accounts.getNewAccessToken(token.email);
      const newToken = refreshed?.[0]?.token;
      if (!newToken) throw err;
      return await doGet(newToken);
    }
  }

  private transformToReportDto(item: any, groupId: string, accountId: string): CreateReportDto {
    return {
      reportIdPB: item.id,
      name: item.name,
      webUrl: item.webUrl,
      embedUrl: item.embedUrl,
      datasetId: item.datasetId,
      groupIdPB: groupId,
      accountID: accountId
    } as CreateReportDto;
  }

  private handleError(error: any): void {
    this.logger.error('Error fetching reports from Power BI', error);
    if (error.response && error.response.data) {
      this.logger.error('Response Data:', error.response.data);
    }
    if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
      throw error;
    }
    throw new InternalServerErrorException('An error occurred while fetching reports');
  };
  async createMany(createReportDto: CreateReportDto[]) {
    try {
      // Upsert por reportIdPB: si el reporte ya existe se actualiza en lugar de
      // duplicarse. Antes usaba `new Model().save()` en loop, lo que insertaba
      // un documento nuevo cada vez que /reports/syncronize corría y hacía que
      // el mismo reportIdPB tuviera N docs con distintos _id — la causa raíz
      // de los reportes duplicados en la UI de permisos.
      const results = await Promise.all(
        createReportDto.map(async (item) => {
          await this.addGroupId(item.groupIdPB, item.reportIdPB);
          return this.reportModel.findOneAndUpdate(
            { reportIdPB: item.reportIdPB },
            { $set: item },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }),
      );
      // Inseriu relatorios e atualizou group.reports — invalida ambos namespaces.
      await this.cache.delByPrefix(CACHE_NS.REPORTS);
      await this.cache.delByPrefix(CACHE_NS.GROUPS);
      return results;

    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  };
  async addGroupId(groupIdPB: string, report: string) {
    try {
      const groups = await this.groupModel.find({ groupIdPB });
      for (const group of groups) {
        if (!group.reports.includes(report)) {
          await this.groupModel.updateOne(
            { _id: group._id },
            {
              $push: { reports: report },
              $currentDate: { lastModified: true }
            }
          );
        }
      }
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  };

  async findAll(): Promise<{ reports: Report[]; count: number }> {
    return this.cache.wrap(
      CacheKeys.reportsAll(),
      async () => {
        try {
          const reports = await this.reportModel.find();
          const count = await this.reportModel.count()
          return { reports, count };

        } catch (error) {
          throw new InternalServerErrorException(error.message);
        }
      },
      CACHE_TTL.ONE_HOUR,
    );
  };
  async findManyByReportIds(reportIds: string[]): Promise<Report[]> {
    if (!reportIds || reportIds.length === 0) {
      return [];
    }
    try {
      return await this.reportModel.find({ reportIdPB: { $in: reportIds } });
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  };
  async findOneByReportId(id: string): Promise<Report> {
    try {
      const result = await this.reportModel.findOne({ reportID: id })

      if (!result) {
        throw new NotFoundException(`Nenhum relatorio encontrado com ID : ${id}`);
      }
      return result

    } catch (error) {
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  };
  async filterGroups(reports: string[]) {
    try {
      const uniqueGroupIDs = new Set<string>();

      for (const reportId of reports) {
        const result = await this.reportModel.findOne({ reportIdPB: reportId });

        if (result && result.groupIdPB) {
          uniqueGroupIDs.add(result.groupIdPB);
        }
      };
      return Array.from(uniqueGroupIDs);

    } catch (error) {
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  async findOne(reportIdPB: string, email: string): Promise<Report> {
    try {
      const result = await this.reportModel.findOne({ reportIdPB })
        .populate({
          path: 'accountID',
          select: 'nameAccount token email',
          model: this.accountModel
        })
        .select('reportIdPB groupIdPB accountId name embedUrl createdAt');
      if (!result) {
        throw new NotFoundException(`Nenhum relatorio foi encontrado com ID : ${reportIdPB}`);
      }
      // O populate lê `token` direto do Mongo — sem forçar refresh de Azure,
      // tokens vencidos ficam servindo ao frontend e o Power BI SDK responde
      // "Access token has expired, resubmit with a new access token". Delegamos
      // em getIdAccount() para reutilizar a lógica de refresh (threshold 3-min)
      // e substituímos o token de cada Account populado pelo fresco.
      const accounts: any[] = Array.isArray(result.accountID)
        ? (result.accountID as any[])
        : result.accountID
          ? [result.accountID as any]
          : [];
      for (const acc of accounts) {
        if (acc?._id) {
          const fresh = await this.accounts.getIdAccount(String(acc._id));
          if (fresh?.token) acc.token = fresh.token;
        }
      }
      result.embedUrl = `${result.embedUrl}&filter=zUsuarios%2Femail%20eq%20%27${email}%27`;
      return result;

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }

  };
  async findOneByID(reportIdPB: string): Promise<Report> {
    try {
      const result = await this.reportModel.findOne({ reportIdPB })
        .populate({
          path: 'accountID',
          select: 'nameAccount token email',
          model: this.accountModel
        })
        .select('reportIdPB groupIdPB accountId name embedUrl createdAt');
      if (!result) {
        throw new NotFoundException(`Nenhum relatorio foi encontrado com ID : ${reportIdPB}`);
      }
      return result;

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  };
  async remove(id: string): Promise<any> {
    try {
      const result = await this.reportModel.deleteOne({
        _id: id,
      }).exec();
      await this.cache.delByPrefix(CACHE_NS.REPORTS);
      await this.cache.delByPrefix(CACHE_NS.GROUPS);
      return result;

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }

  };
  async removeAll(groupId: string): Promise<any> {
    try {
      const result = await this.reportModel.deleteMany({
        groupIdPB: groupId
      }).exec();
      await this.cache.delByPrefix(CACHE_NS.REPORTS);
      await this.cache.delByPrefix(CACHE_NS.GROUPS);
      return result;

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`GroupID: ${groupId} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);

    }
  }
}
