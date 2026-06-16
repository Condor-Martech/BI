import { CreateUserDto, ROLE_TYPES } from '../src/app/modules/users/dto/create-user.dto';
import { SendMailWelcomeProducer } from '../src/app/core/jobs/sendMailWelcome-producer';
import { SendMailResetProducer } from '../src/app/core/jobs/sendMailResetPass-producer';
import { AccountsService } from '../src/app/modules/accounts/accounts.service';
import { UpdateUserDto } from '../src/app/modules/users/dto/update-user.dto';
import { UsersController } from '../src/app/modules/users/users.controller';
import { ReportsService } from '../src/app/modules/reports/reports.service';
import { LoginUserDto } from '../src/app/modules/users/dto/login-user.dto';
import { User, UserDocument } from '../src/app/modules/users/user.entity';
import { UsersService } from '../src/app/modules/users/users.service';
import { HashManager } from '../src/app/core/utils/hash.manager';
import { updateResult, userInput } from './mocks/user.mock';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { account } from './mocks/account.mock';
import { DeleteResult } from 'mongodb';
import { Authenticator } from '../src/app/core/utils/authenticator';

const userList: User[] = [
  new User({
    name: "Diego", password: "dsa5d1sa51d56sa", email: "diego@hotmail.com", role: "manager", groupByPB: ["dsad41sad1sa5d5sas4156d1sa-dsa1d5sa1"]
  }),
  new User({
    name: "Eduardo", password: "dsa5d1sa51d56sa", email: "eduardo@hotmail.com", role: "user", groupByPB: ["dsad41sad1sa5d5sas4156d1sa-dsa1d5sa1"], accountID: ['dsa1d5sa15d1sa1d0sa1d51']
  }),
  new User({
    name: "Diego Eduardo", password: "$dslkamdksa", email: "teste@teste.com", role: "user", accountID: ['dsa1d5sa15d1sa1d0sa1d51'], groupByPB: ["dsad41sad1sa5d5sas4156d1sa-dsa1d5sa1"]
  })
]
const logonResult = { access_token: "sfdsadsadsadsadsadsa2d1sa51d5sa", user: userList[0] };

describe('UsersController', () => {
  let usersController: UsersController;
  let usersService: UsersService;
  let accountService: AccountsService;
  let reportService: ReportsService;
  let hashManager: HashManager;
  let authenticator: Authenticator

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{
        provide: UsersService,
        useValue: {
          userModel: jest.fn(),
          create: jest.fn().mockResolvedValue(userList[0]),
          logon: jest.fn(),
          findAll: jest.fn(),
          findUserByEmail: jest.fn().mockResolvedValue(userList[0]),
          findOne: jest.fn().mockResolvedValue(userList[1]),
          update: jest.fn(),
          updateGroupAndReports: jest.fn(),
          incluedAccountID: jest.fn(),
          updatePass: jest.fn(),
          remove: jest.fn().mockResolvedValue(undefined),
        }
      }, {
        provide: Authenticator,
        useValue: {
          generate: jest.fn(),
          getTokenData: jest.fn(),
          checkUserAndRole: jest.fn()
        }
      }, {
        provide: AccountsService,
        useValue: {
          create: jest.fn(),
          findAllAccounts: jest.fn(),
          findByExpiresOn: jest.fn(),
          getBiAccount: jest.fn(),
          getIdAccount: jest.fn(),
          getNewAccessToken: jest.fn(),
          update: jest.fn()
        }
      }, {
        provide: ReportsService,
        useValue: {
          getAllReportsByGroup: jest.fn(),
          getReports: jest.fn(),
          createMany: jest.fn(),
          addGroupId: jest.fn(),
          findAll: jest.fn(),
          findOneByReportId: jest.fn(),
          filterGroups: jest.fn(),
          findOne: jest.fn()
        }
      },
      {
        provide: HashManager,
        useValue: {
          hash: jest.fn(),
          compare: jest.fn()
        }
      }, {
        provide: SendMailWelcomeProducer,
        useValue: {
          sendMailWelcome: jest.fn()
        }
      },
      {
        provide: SendMailResetProducer,
        useValue: {
          sendMailResetPass: jest.fn()
        }
      }]
    }).compile();

    usersController = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
    accountService = module.get<AccountsService>(AccountsService);
    reportService = module.get<ReportsService>(ReportsService);
    hashManager = module.get<HashManager>(HashManager);
    authenticator = module.get<Authenticator>(Authenticator);
  });

  it('should be defined', () => {
    expect(usersController).toBeDefined();
    expect(usersService).toBeDefined();
    expect(accountService).toBeDefined();
    expect(reportService).toBeDefined();
    expect(hashManager).toBeDefined();
    expect(authenticator).toBeDefined()
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        name: 'John Doe',
        email: 'johndoe@example.com',
        accountUser: 'bi@example.com',
        role: ROLE_TYPES.USER,
        groupIdPB: [],
        reportIdPB: []
      };

      const accountId = 'accountId';
      const expectedUser = { id: 'userId', name: 'John Doe', email: 'johndoe@example.com', role: ROLE_TYPES.USER };
      const newUser = { user: userList[0], access_token: "sadsadsad" }

      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue(null);
      jest.spyOn(accountService, 'getBiAccount').mockResolvedValue({ _id: accountId });
      jest.spyOn(usersService, 'create').mockResolvedValue(newUser);

      const req: any = { headers: {} };
      const result = await usersController.create(req, createUserDto);

      expect(usersService.findUserByEmail).toHaveBeenCalledWith(createUserDto.email);
      expect(accountService.getBiAccount).toHaveBeenCalledWith(createUserDto.accountUser);
      expect(usersService.create).toHaveBeenCalledWith(createUserDto, accountId);
      expect(result).toEqual(newUser);
    });


    it('should throw an error if user with the same email already exists', async () => {
      const userFromDB: any = new User({});

      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue(userFromDB);

      const req: any = { headers: {} };
      await expect(usersController.create(req, userInput)).rejects.toThrowError();
      expect.assertions(1)

    });
  });

  describe('login', () => {
    it('should log in a user', async () => {
      const loginUserDto: LoginUserDto = { email: 'diego@lima.com', password: "1d5sa1d5sa1d51s" };

      jest.spyOn(usersService, 'logon').mockResolvedValue(logonResult);

      const result = await usersController.login(loginUserDto);
      expect(usersService.logon).toHaveBeenCalledWith(loginUserDto);
      expect(result).toEqual(logonResult);
      expect.assertions(2)
    });


    it('should throw an error if no user with the email is found', async () => {
      const loginUserDto: LoginUserDto = { email: 'diego@lima.com', password: "1d5sa1d5sa1d51s" };

      const result = new HttpException(`Nenhum usuario encontrado com email: ${loginUserDto.email}`, HttpStatus.UNAUTHORIZED)

      jest.spyOn(usersService, 'logon').mockRejectedValueOnce(result);

      await expect(usersService.logon(loginUserDto)).rejects.toThrowError(result);
      expect.assertions(1);
    });
  });
  describe('findAll', () => {
    it('should return all users for a manager', async () => {
      const token = 'Bearer {token}';
      const tokenData: any = { id: 'managerId', email: 'teste@email.com', role: ROLE_TYPES.MANAGER };

      jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValue(tokenData);
      jest.spyOn(usersService, 'findAll').mockResolvedValue(userList);

      const req: any = { headers: { authorization: token } };

      const result = await usersController.findAll(req);

      expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toEqual(userList);
    });

    it('should throw an error if no token is provided', async () => {
      const req: any = { headers: {} };

      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.BAD_REQUEST)
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);

      await expect(usersController.findAll(req)).rejects.toThrowError(errorResult);
    });

    it('should throw an error if no users are found', async () => {
      const token = 'Bearer {token}';
      const tokenData = { id: 'managerId', email: 'teste@email.com', role: ROLE_TYPES.MANAGER };
      const users = []

      const result = new HttpException('Nenhum usuário foi encontrado', HttpStatus.NOT_FOUND)

      jest.spyOn(authenticator, 'getTokenData').mockReturnValue(tokenData);
      jest.spyOn(usersService, 'findAll').mockRejectedValueOnce(result);

      const req: any = { headers: { authorization: token } };

      await expect(usersController.findAll(req)).rejects.toThrowError(result);

      expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toEqual(result);

    });
  });
  describe('findOne', () => {
    it('should return the user details for a valid token', async () => {
      const token = 'Bearer {validToken}';
      const tokenData = { id: 'userId', email: 'teste@email.com', role: 'manager' };
      const userFromDB: any = { id: 'userId', name: 'John Doe', email: 'johndoe@example.com' };

      jest.spyOn(authenticator, 'getTokenData').mockReturnValue(tokenData);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(userFromDB);

      const req: any = { headers: { authorization: token } };

      const result = await usersController.findOne(req);

      expect(authenticator.getTokenData).toHaveBeenCalledWith(token);
      expect(usersService.findOne).toHaveBeenCalledWith(tokenData.id);
      expect(result).toEqual(userFromDB);
    });

    it('should throw an error if no token is provided', async () => {
      const req: any = { headers: {} };

      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.BAD_REQUEST)
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);

      await expect(usersController.findOne(req)).rejects.toThrowError(errorResult);
    });
    it('should throw an error if no user is found with the provided ID', async () => {
      const token = 'Bearer {validToken}';
      const tokenData = { id: 'invalidUserId', email: 'teste@email.com', role: 'user' };
      const result = new HttpException(`Nenhum usuário encontrado com ID: ${tokenData.id}`, HttpStatus.NOT_FOUND)

      jest.spyOn(authenticator, 'getTokenData').mockReturnValue(tokenData);
      jest.spyOn(usersService, 'findOne').mockRejectedValueOnce(result);

      const req: any = { headers: { authorization: token } };

      await expect(async () => {
        await usersController.findOne(req);
      }).rejects.toThrowError(result);

      expect(authenticator.getTokenData).toHaveBeenCalledWith(token);
      expect(usersService.findOne).toHaveBeenCalledWith(tokenData.id);
      expect.assertions(3)
    });
  })
  describe('update', () => {
    it('should update a user', async () => {
      const userID = '1';
      const updateUserDto: UpdateUserDto = { name: "testes", email: "testes@novotestes.com.br" };
      const updatedUser = {
        id: '1',
        name: 'testes',
        email: 'testes@novotestes.com.br',
        password: "d51sa56d1sa5",
        role: ROLE_TYPES.MANAGER,
        groupByPB: ['sd51sa5d1sa51d5sa']
      };

      jest.spyOn(authenticator, 'getTokenData').mockReturnValue({ id: userID, email: 'teste@email.com', role: 'manager' });
      jest.spyOn(usersService, 'update').mockResolvedValue(updatedUser);

      const req: any = { headers: { authorization: 'Bearer {token}' } };

      const result = await usersController.update(updateUserDto, req);

      expect(authenticator.getTokenData).toHaveBeenCalledWith('Bearer {token}');
      expect(usersService.update).toHaveBeenCalledWith(userID, updateUserDto);
      expect(result).toEqual(updatedUser);
    });

    it('should throw an error if no token is provided', async () => {
      const req: any = { headers: {} };

      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.BAD_REQUEST)
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);

      await expect(usersController.update({}, req)).rejects.toThrowError(errorResult);
    });
  });

  describe('updateAccountIDs', () => {
    it('should update account IDs', async () => {
      const email = 'test@example.com';
      const userID = '1';
      const token = 'Bearer {token}';
      const tokenData = { id: userID, email: 'teste@email.com', role: 'ROLE_TYPES.MANAGER' };
      const accountId = { _id: 'dsa32d3sa2d3sa2' };
      const updatedUser: any = { id: userID, accountID: [accountId._id] };

      jest.spyOn(authenticator, 'getTokenData').mockReturnValue(tokenData);
      jest.spyOn(accountService, 'getBiAccount').mockResolvedValue(account);
      jest.spyOn(usersService, 'incluedAccountID').mockResolvedValue(accountId);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(updatedUser);

      const req: any = { headers: { authorization: token } };

      const result = await usersController.updateAccountIDs(email, req);

      expect(authenticator.getTokenData).toHaveBeenCalledWith(token);
      expect(accountService.getBiAccount).toHaveBeenCalledWith(email);
      expect(usersService.incluedAccountID).toHaveBeenCalledWith(updatedUser.id, accountId._id);
      expect(usersService.findOne).toHaveBeenCalledWith(userID);
      expect(result).toEqual(updatedUser);
    });

    it('should throw an error for non-manager users', async () => {
      const email = 'test@example.com';
      const userID = '1';
      const token = 'Bearer {token}';

      const errorResult = new HttpException("Somente user manager podem adicionar mais contas", HttpStatus.CONFLICT)
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);

      const req: any = { headers: { authorization: token } };

      await expect(usersController.updateAccountIDs(email, req)).rejects.toThrowError(errorResult);

    });
    it('should throw an error if no token is provided', async () => {
      const email = 'test@example.com';
      const req: any = { headers: {} };

      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.CONFLICT);
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);
      await expect(usersController.updateAccountIDs(email, req)).rejects.toThrowError(errorResult);
    });
  });

  describe('updateGroupAndReport', () => {
    it('should update group and reports', async () => {
      const id = '1';
      const updateUserDto: UpdateUserDto = { reportIdPB: ['reportId1', 'reportId2'] };
      const tokenData = { id: id, email: 'teste@email.com', role: ROLE_TYPES.MANAGER };
      const token = 'Bearer {token}';
      const user: any = { id: '1' };
      const groupsId = ['groupId1', 'groupId2'];
      const update = { id: '1', groupIdPB: groupsId };

      jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValue(tokenData);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);
      jest.spyOn(reportService, 'filterGroups').mockResolvedValue(groupsId);
      jest.spyOn(usersService, 'updateGroupAndReports').mockResolvedValue(update);

      const req: any = { headers: { authorization: token } };

      const result = await usersController.updateGroupAndReport(id, updateUserDto, req);

      expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
      expect(usersService.findOne).toHaveBeenCalledWith(id);
      expect(reportService.filterGroups).toHaveBeenCalledWith(updateUserDto.reportIdPB);
      expect(usersService.updateGroupAndReports).toHaveBeenCalledWith(id, updateUserDto);
      expect(result).toEqual(update);
    });

    it('should throw an error if no token is provided', async () => {
      const id = '1';
      const updateUserDto: UpdateUserDto = { reportIdPB: ['reportId1', 'reportId2'] };
      const req: any = { headers: {} };
      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.CONFLICT);
      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);
      await expect(usersController.updateGroupAndReport(id, updateUserDto, req)).rejects.toThrowError(errorResult)
    });
  });

  describe('resetPassword', () => {
    it('should reset user password', async () => {
      const email = 'test@example.com';
      const user: any = { email: 'test@example.com' };

      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue(user);
      jest.spyOn(usersService, 'updatePass').mockResolvedValue(undefined);

      const result = await usersController.resetPassword(email);

      expect(usersService.findUserByEmail).toHaveBeenCalledWith(email);
      expect(usersService.updatePass).toHaveBeenCalledWith(user.email);
      expect(result).toEqual({ message: 'Sua nova senha foi enviada para seu email' });
    });

    it('should throw an error if no user with the email is found', async () => {
      const email = 'test@example.com';

      jest.spyOn(usersService, 'findUserByEmail').mockResolvedValue(null);

      await expect(usersController.resetPassword(email)).rejects.toThrowError(
        new HttpException(`Nenhum usuario encontrado com email: ${email}`, HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('remove', () => {
    it('should successfully remove a user', async () => {
      const user: any = { id: '1' };
      const token = 'Bearer {validToken}';

      const req: any = {
        headers: {
          authorization: token,
        },
      };

      jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValueOnce(token);
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);
      jest.spyOn(usersService, 'remove').mockResolvedValueOnce({} as DeleteResult);

      const result = await usersController.remove(user, req);

      expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
      expect(usersService.findOne).toHaveBeenCalledWith(user);
      expect(usersService.remove).toHaveBeenCalledWith(user);
      expect(result).toEqual({} as DeleteResult);
    });

    it('should throw an error for invalid or unauthorized token', async () => {
      const id = 'daslod15askmdsa';
      const invalidToken = 'Bearer invalidToken';
      const req: any = { headers: { authorization: invalidToken } };

      const errorResult = new HttpException('Necessário estar logado para usar endpoint', HttpStatus.CONFLICT);

      jest.spyOn(authenticator, 'checkUserAndRole').mockRejectedValueOnce(errorResult);
      await expect(usersController.remove(id, req)).rejects.toThrowError(errorResult);
    });


  });

});
