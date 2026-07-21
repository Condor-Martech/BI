import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from '../src/app/modules/users/users.service';
import { User } from '../src/app/modules/users/user.entity';
import { Account } from '../src/app/modules/accounts/account.entity';
import { Filter } from '../src/app/modules/filters/entities/filter.entity';
import { Report } from '../src/app/modules/reports/report.entity';
import { Group } from '../src/app/modules/groups/group.entity';
import { UserGroups } from '../src/app/modules/user-groups/user-group.entity';
import { SendMailResetProducer } from '../src/app/core/jobs/sendMailResetPass-producer';
import { SendMailWelcomeProducer } from '../src/app/core/jobs/sendMailWelcome-producer';
import { Authenticator } from '../src/app/core/utils/authenticator';
import { AccountsService } from '../src/app/modules/accounts/accounts.service';
import { LoginLogService } from '../src/app/modules/login-log/login-log.service';
import { HashManager } from '../src/app/core/utils/hash.manager';
import { EventsService } from '../src/app/modules/events/events.service';

describe('UsersService — admin operations', () => {
  let service: UsersService;
  const userModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  };
  const hashManager = { hash: jest.fn(), generatePassword: jest.fn() };
  const authenticator = { generate: jest.fn(), getTokenData: jest.fn() };
  const sendMailReset = { sendMailResetPass: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Account.name), useValue: {} },
        { provide: getModelToken(Filter.name), useValue: {} },
        { provide: getModelToken(Report.name), useValue: {} },
        { provide: getModelToken(Group.name), useValue: {} },
        { provide: getModelToken(UserGroups.name), useValue: {} },
        { provide: SendMailResetProducer, useValue: sendMailReset },
        { provide: SendMailWelcomeProducer, useValue: {} },
        { provide: Authenticator, useValue: authenticator },
        { provide: AccountsService, useValue: {} },
        { provide: LoginLogService, useValue: {} },
        { provide: HashManager, useValue: hashManager },
        { provide: EventsService, useValue: {} },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('adminResetPassword', () => {
    it('generates a new password, hashes and updates without sending mail', async () => {
      userModel.findOne.mockResolvedValue({ _id: 'u1', email: 'target@x.com' });
      hashManager.generatePassword.mockReturnValue('newPass1234');
      hashManager.hash.mockResolvedValue('hashed');
      userModel.updateOne.mockResolvedValue({ acknowledged: true });

      const result = await service.adminResetPassword('target@x.com', 12);

      expect(hashManager.generatePassword).toHaveBeenCalledWith(12);
      expect(hashManager.hash).toHaveBeenCalledWith('newPass1234');
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { password: 'hashed' }, $currentDate: { lastModified: true } }
      );
      expect(sendMailReset.sendMailResetPass).not.toHaveBeenCalled();
      expect(result.email).toBe('target@x.com');
      expect(result.password).toBe('newPass1234');
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException if user does not exist', async () => {
      userModel.findOne.mockResolvedValue(null);
      await expect(service.adminResetPassword('missing@x.com')).rejects.toThrow(NotFoundException);
    });

    it('uses default length 12 when not provided', async () => {
      userModel.findOne.mockResolvedValue({ _id: 'u1', email: 'target@x.com' });
      hashManager.generatePassword.mockReturnValue('xxxxxxxxxxxx');
      hashManager.hash.mockResolvedValue('h');
      userModel.updateOne.mockResolvedValue({});
      await service.adminResetPassword('target@x.com');
      expect(hashManager.generatePassword).toHaveBeenCalledWith(12);
    });
  });

  describe('adminGenerateImpersonationToken', () => {
    it('generates a JWT with the target payload and 1h TTL', async () => {
      userModel.findOne.mockResolvedValue({
        _id: 'targetId',
        email: 'target@x.com',
        name: 'Target',
        role: 'user',
      });
      authenticator.generate.mockReturnValue('signed.jwt.token');
      authenticator.getTokenData.mockReturnValue({
        id: 'targetId', email: 'target@x.com', role: 'user', name: 'Target',
        exp: 1700000000, iat: 1699996400,
      });

      const result = await service.adminGenerateImpersonationToken('target@x.com');

      expect(authenticator.generate).toHaveBeenCalledWith(
        { id: 'targetId', email: 'target@x.com', role: 'user', name: 'Target' },
        '1h',
      );
      expect(result.token).toBe('signed.jwt.token');
      expect(result.exp).toBe(1700000000);
      expect(result.target).toEqual({ email: 'target@x.com', name: 'Target', role: 'user' });
    });

    it('throws NotFoundException when target does not exist', async () => {
      userModel.findOne.mockResolvedValue(null);
      await expect(service.adminGenerateImpersonationToken('nope@x.com')).rejects.toThrow(NotFoundException);
    });
  });
});
