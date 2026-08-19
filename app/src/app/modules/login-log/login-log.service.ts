import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { LoginDocument, LoginLog } from './login-log.entity';
import { User, UserDocument } from '../users/user.entity';
import { InjectModel } from '@nestjs/mongoose';
import moment from 'moment-timezone';
import { Model } from 'mongoose';

@Injectable()
export class LoginLogService {

  private readonly logger = new Logger(LoginLogService.name);

  constructor(
    @InjectModel(LoginLog.name) private loginModel: Model<LoginDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>) { }

  async registerLoginLog(userId: string): Promise<void> {
    const loginTime = moment().tz('America/Sao_Paulo').toDate();
    const newLog = new this.loginModel({ userId, loginTime });
    await newLog.save();
    try {
      await this.userModel.findByIdAndUpdate(userId, { lastLogin: loginTime }).exec();
    } catch (err) {
      this.logger.error(
        `Falha ao atualizar User.lastLogin para userId=${userId} apos registrar loginlog. O login prosseguira; o cache lastLogin pode estar desatualizado.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async findAll() {
    const result = await this.loginModel.find()
      .populate({
        path: 'userId',
        select: 'name email role loginTime',
        model: this.userModel
      })
      .select('name email role loginTime');
    if (!result) {
      throw new HttpException(`Nenhum log foi encontrado`, HttpStatus.NOT_FOUND);
    }
    const parsedResult = result.map(log => ({
      _id: log._id,
      user: log.userId[0],
      loginTime: log.loginTime
    }));

    return parsedResult;

  }

  async findOne(userId: string) {
    const result = await this.loginModel.findOne({ userId })
      .populate({
        path: 'userId',
        select: 'name email role loginTime',
        model: this.userModel
      })
      .select('name email role loginTime');
    if (!result) {
      throw new HttpException(`Nenhum log foi encontrado com ID : ${userId}`, HttpStatus.NOT_FOUND);
    }
    const parsedResult = {
      _id: result._id,
      user: result.userId[0],
      loginTime: result.loginTime
    };

    return parsedResult;
  };

}
