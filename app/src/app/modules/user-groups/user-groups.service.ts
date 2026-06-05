import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { Report, ReportDocument } from '../reports/report.entity';
import { Model, Error as MongooseError } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserGroupDocument, UserGroups } from './user-group.entity';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';
import { AccountsService } from '../accounts/accounts.service';
import { User, UserDocument } from '../users/user.entity';

@Injectable()
export class UserGroupsService {
  constructor(
    @InjectModel(UserGroups.name) private userGroupModel: Model<UserGroupDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly accountService: AccountsService
  ) { }


  async create(createUserGroupDto: CreateUserGroupDto) {
    try {
      const group = new this.userGroupModel(createUserGroupDto);
      const saved = await group.save();

      // Vincular o usuário inicial ao grupo. PermissionsService resolve os relatórios
      // em tempo real a partir de User.userGroups, então sem este vínculo o usuário
      // não enxerga nenhum relatório do grupo recém-criado.
      const initialUser = createUserGroupDto.users;
      if (initialUser) {
        await this.userGroupModel.updateMany(
          { _id: { $ne: saved._id } },
          { $pull: { users: initialUser } }
        );
        await this.userModel.findByIdAndUpdate(initialUser, { $set: { userGroups: saved._id } });
      }
      return saved;

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`User not found: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  async findAll() {
    try {
      return await this.userGroupModel.find().exec();

    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async findOne(id: string) {
    try {
      const group = await this.userGroupModel.findById(id);
      if (!group) {
        throw new NotFoundException(`Group with ID ${id} not found`);
      }
      return group;

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }

  async updateGroupReports(groupId: string, updateUserGroupDto: UpdateUserGroupDto): Promise<UserGroups> {
    try {
      const { name, accountID, reports, usersIds } = updateUserGroupDto;

      if (reports) {
        const validReports = await this.reportModel.find({ reportIdPB: { $in: reports.map(id => id.toString()) } });
        if (validReports.length !== reports.length) {
          throw new NotFoundException(`One or more reports not found`);
        }
      }
      if (usersIds) {
        const validUsers = await this.userModel.find({ _id: { $in: usersIds } }).select('_id');
        if (validUsers.length !== usersIds.length) {
          throw new NotFoundException(`One or more users not found`);
        }
      }
      if (accountID) {
        await this.accountService.getIdAccount(accountID);
      }
      const updateData: any = {};
      if (name) updateData.name = name;
      if (accountID) updateData.accountID = accountID;
      if (reports) updateData.reports = reports;
      if (usersIds) updateData.users = usersIds;

      const userGroup = await this.userGroupModel.findByIdAndUpdate(groupId, updateData, { new: true });
      if (!userGroup) {
        throw new NotFoundException(`UserGroup with ID ${groupId} not found`);
      }

      // Os relatórios do grupo são resolvidos em tempo real por PermissionsService a
      // partir de User.userGroups (um grupo por usuário). `usersIds` é a lista COMPLETA
      // de membros desejada, então reconciliamos o vínculo nos documentos de usuário:
      if (usersIds) {
        // 1) Membros removidos: limpar o vínculo se ainda apontava para este grupo.
        await this.userModel.updateMany(
          { _id: { $nin: usersIds }, userGroups: groupId },
          { $set: { userGroups: null } }
        );
        // 2) Membros vindos de outro grupo: removê-los da lista daquele grupo.
        await this.userGroupModel.updateMany(
          { _id: { $ne: groupId } },
          { $pull: { users: { $in: usersIds } } }
        );
        // 3) Membros atuais: apontar o vínculo para este grupo.
        await this.userModel.updateMany(
          { _id: { $in: usersIds } },
          { $set: { userGroups: groupId } }
        );
      }
      return userGroup;
    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  async remove(id: string): Promise<any> {
    try {
      return await this.userGroupModel.deleteOne({
        _id: id,
      }).exec();

    } catch (error) {
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Report with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }

  }
}
