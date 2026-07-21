import { Filter, FilterSchema } from '../filters/entities/filter.entity';
import { Account, AccountSchema } from '../accounts/account.entity';
import { Report, ReportSchema } from '../reports/report.entity';
import { LoginLogModule } from '../login-log/login-log.module';
import { Authenticator } from '../../core/utils/authenticator';
import { Group, GroupSchema } from '../groups/group.entity';
import { Global, Module, forwardRef } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { JobModule } from '../../core/jobs/jobs.module';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.entity';
import { UsersService } from './users.service';
import { UserGroupSchema, UserGroups } from '../user-groups/user-group.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminAllowlistGuard } from '../../core/auth/admin-allowlist.guard';
import { SuperAdminGuard } from '../../core/auth/super-admin.guard';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserGroups.name, schema: UserGroupSchema }]),
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    MongooseModule.forFeature([{ name: Filter.name, schema: FilterSchema }]),
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    MongooseModule.forFeature([{ name: Group.name, schema: GroupSchema }]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AccountsModule,
    LoginLogModule,
    // forwardRef: en el orden de carga JS, mod → ReportsModule → JobModule →
    // NotificationsModule → UsersModule, cuando users.module.ts ejecuta su @Module
    // los bindings `ReportsModule` y `JobModule` todavía están en mid-load
    // (sus `export class` no se ejecutaron). forwardRef difiere la lectura.
    forwardRef(() => ReportsModule),
    forwardRef(() => JobModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, Authenticator, AdminAllowlistGuard, SuperAdminGuard],
  exports: [UsersService]
})
export class UsersModule { }
