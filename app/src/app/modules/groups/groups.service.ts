import { Injectable, NotFoundException } from '@nestjs/common';
import { Report, ReportDocument } from '../reports/report.entity';
import { AccountsService } from '../accounts/accounts.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { Group, GroupsDocument } from './group.entity';
import { CacheService } from '../../core/cache/cache.service';
import { CACHE_NS, CACHE_TTL, CacheKeys } from '../../core/cache/cache.keys';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { Model } from 'mongoose';

@Injectable()
export class GroupsService {
  constructor(
    private readonly cache: CacheService,
    @InjectModel(Group.name) private readonly groupModel: Model<GroupsDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    private readonly accountService: AccountsService,
    private readonly http: HttpService
  ) { }

  async createAllGroupByAccount(accountId: string): Promise<any> {
    // FETCH primeiro, destructive DEPOIS. Antes fazíamos removeAll() + deleteMany()
    // + cache.delByPrefix() ANTES de chamar Azure — se PowerBI/refresh falhava, a
    // conta ficava com 0 groups + 0 reports até o próximo sync bem-sucedido. Agora
    // se refresh ou o GET /groups falham, o estado prévio do DB fica intacto e o
    // erro sobe até o consumer para acionar retries do Bull (attempts:3, backoff).
    const token = await this.accountService.getIdAccount(accountId);
    const rawGroups: any[] = await this.getGroupsWithTokenRetry(token);

    const groups: CreateGroupDto[] = rawGroups.map((item: any) => ({
      groupIdPB: item.id,
      accountId: token._id,
      name: item.name,
      isReadOnly: item.isReadOnly,
      isOnDedicatedCapacity: item.isOnDedicatedCapacity,
      type: item.type,
    } as CreateGroupDto));

    // Fetch bem-sucedido — só agora invalidamos o estado antigo.
    await this.removeAll(accountId);
    await this.reportModel.deleteMany({ accountID: accountId }).exec();
    await this.cache.delByPrefix(CACHE_NS.GROUPS);
    await this.cache.delByPrefix(CACHE_NS.REPORTS);

    if (groups.length > 0) {
      await this.createMany(groups);
    }
    return groups;
  };

  private async getGroupsWithTokenRetry(token: any): Promise<any[]> {
    const url = `${process.env.POWER_BI_BASE_URL}/groups`;
    const doGet = (bearer: string) =>
      firstValueFrom(
        this.http.get(url, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${bearer}`,
          },
        }).pipe(map(res => res.data.value ?? [])),
      );

    try {
      return await doGet(token.token);
    } catch (err: any) {
      // 401 = token invalidado entre getIdAccount() e o HTTP call (janela pequena
      // mas real: revocação por Azure, conditional access, etc.). Forçamos
      // getNewAccessToken (bypass do threshold de 3-min) e reintentamos UMA vez.
      if (err?.response?.status !== 401) throw err;
      const refreshed: any = await this.accountService.getNewAccessToken(token.email);
      const newToken = refreshed?.[0]?.token;
      if (!newToken) throw err;
      return await doGet(newToken);
    }
  };
  async createMany(createGroupDto: CreateGroupDto[]) {
    const results = await Promise.all(
      createGroupDto.map(async (item) => {
        const group = new this.groupModel(item);
        return await group.save();
      })
    );
    return results;
  };
  async findAllByAccount(accountId: string): Promise<{ groups: Group[], countReports: number }> {
    const groups = await this.groupModel.find({ accountId: accountId })
      .populate({
        path: 'report',
        select: '',
        model: this.reportModel
      })
      .select('groupIdPB accountId name report createdAt reports')
      .exec();
    const countReports = await this.reportModel.count({ accountId: accountId })
    if (!groups) {
      throw new NotFoundException(`Nenhum grupo encontrado`);
    }
    return { groups, countReports };
  };
  async findOneAndReports(groupIdPB: string): Promise<{ data: Group[]; count: number }> {
    return this.cache.wrap(
      CacheKeys.groupReports(groupIdPB),
      async () => {
        const data = await this.groupModel.find({ groupIdPB })
          .populate({
            path: 'report',
            select: 'reportID name embedUrl',
            model: this.reportModel
          })
          .exec();
        const count = await this.reportModel.countDocuments({ groupIdPB });
        return { data, count };
      },
      CACHE_TTL.ONE_HOUR,
    );
  };
  async findOne(id: string): Promise<Group> {
    const result = await this.groupModel.findOne({ groupIdPB: id })
    if (!result) {
      throw new NotFoundException(`Nenhum Grupo encontrado com ID : ${id}`);
    }
    return result
  };
  async remove(id: string): Promise<any> {
    const result = await this.groupModel.deleteOne({
      _id: id,
    }).exec();
    await this.cache.delByPrefix(CACHE_NS.GROUPS);
    return result;
  };
  async removeAll(id: string): Promise<any> {
    const result = await this.groupModel.deleteMany({
      accountId: id
    }).exec();
    await this.cache.delByPrefix(CACHE_NS.GROUPS);
    return result;
  };

}
