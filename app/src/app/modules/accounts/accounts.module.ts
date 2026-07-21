import { Global, Module, forwardRef } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './account.entity';
import { EncryptionService } from '../../core/utils/encryption.service';
import { BackupService } from '../../core/services/backup.service';
import { UtilsModule } from '../../core/utils/utils.module';
import { User, UserSchema } from '../users/user.entity';
import { Group, GroupSchema } from '../groups/group.entity';
import { Report, ReportSchema } from '../reports/report.entity';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Group.name, schema: GroupSchema }]),
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    HttpModule,
    UtilsModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService, EncryptionService, BackupService],
  exports: [AccountsService]
})
export class AccountsModule { }
