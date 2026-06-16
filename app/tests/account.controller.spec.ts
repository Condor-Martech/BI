import { AccountsService } from './../src/app/modules/accounts/accounts.service';
import { AccountsController } from './../src/app/modules/accounts/accounts.controller';
import { UsersService } from '../src/app/modules/users/users.service';
import { Test, TestingModule } from '@nestjs/testing';
import { account } from './mocks/account.mock';
import { CreateAccountDto } from '../src/app/modules/accounts/dto/create-account.dto';
import { RefreshToken } from '../src/app/core/utils/refresh.token.service';
import { Authenticator } from '../src/app/core/utils/authenticator';
import { User } from '../src/app/modules/users/user.entity';
import { BackupService } from '../src/app/core/services/backup.service';


describe('AccountsController', () => {
    let accountController: AccountsController;
    let accountService: AccountsService;
    let usersService: UsersService;
    let authenticator: Authenticator;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AccountsController],
            providers: [{
                provide: AccountsService,
                useValue: {
                    create: jest.fn(),
                    findAllAccounts: jest.fn(),
                    findByExpiresOn: jest.fn(),
                    getBiAccount: jest.fn(),
                    getIdAccount: jest.fn(),
                    getNewAccessToken: jest.fn(),
                    removeAccount: jest.fn(),
                    registerUserAtAccount: jest.fn()
                },
            }, {
                provide: UsersService,
                useValue: {
                    userModel: jest.fn(),
                    create: jest.fn(),
                    logon: jest.fn(),
                    findAll: jest.fn(),
                    findUserByEmail: jest.fn(),
                    findOne: jest.fn(),
                    update: jest.fn(),
                    updateGroupAndReports: jest.fn(),
                    incluedAccountID: jest.fn(),
                    updatePass: jest.fn(),
                    remove: jest.fn().mockResolvedValue(undefined),
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
                    update: jest.fn(),
                    removeAccount: jest.fn()
                }
            }, {
                provide: Authenticator,
                useValue: {
                    generate: jest.fn(),
                    getTokenData: jest.fn(),
                    checkUserAndRole: jest.fn()
                }
            }, {
                provide: BackupService,
                useValue: {
                    backup: jest.fn(),
                    restoreBackup: jest.fn(),
                    runMongorestore: jest.fn()
                }
            }]
        }).compile();

        accountController = module.get<AccountsController>(AccountsController);
        usersService = module.get<UsersService>(UsersService);
        accountService = module.get<AccountsService>(AccountsService);
        authenticator = module.get<Authenticator>(Authenticator);
    });

    it('should be defined', () => {
        expect(accountController).toBeDefined();
        expect(usersService).toBeDefined();
        expect(accountService).toBeDefined();
        expect(authenticator).toBeDefined()
    });
    describe('create', () => {
        it('should create an account and return it', async () => {
            const createAccountDto: CreateAccountDto = {
                "nameAccount": "BI",
                "email": "bi@supcondor.onmicrosoft.com",
                "pass": "REDACTED-rotate-in-azure",
                "clientId": "2844792f-da36-4e08-866e-94701efe7192",
                "clientSecret": "REDACTED-rotate-in-azure",
                "tenantId": "27cc7714-ecb3-407d-8115-da53f624c6da"
            }

            const user = { _id: 'sds1a2d1sa2', name: 'user_id', password: 'd12sa1d2sa', email: 'teste@email.com', role: 'manager' };
            const token = 'mocked_token';
            const req: any = { headers: { authorization: token } };

            jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValue(user);
            jest.spyOn(accountService, 'create').mockResolvedValue(account);
            jest.spyOn(usersService, 'incluedAccountID').mockResolvedValue(undefined);


            const result = await accountController.create(createAccountDto, req);

            expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
            expect(accountService.create).toHaveBeenCalledWith(createAccountDto);
            expect(usersService.incluedAccountID).toHaveBeenCalledWith(user._id, account._id);
            expect(result).toBe(account);
        });
    });

    describe('findAll', () => {
        it('should return all accounts', async () => {
            const token = 'mocked_token';
            const user = [{ _id: 'user_id' }];

            const req: any = { headers: { authorization: token } };
            jest.spyOn(authenticator, 'getTokenData').mockResolvedValue(token as never);
            jest.spyOn(accountService, 'findAllAccounts').mockResolvedValue(account);

            const result = await accountController.findAll(req);

            expect(authenticator.getTokenData).toHaveBeenCalledWith(token);
            expect(accountService.findAllAccounts).toHaveBeenCalled();
            expect(result).toBe(account);
        });
    });

    describe('findOne', () => {
        it('should return the account with the specified id', async () => {
            const id = 'account_id';
            const token = 'mocked_token';
            const account = { /* mock account object */ };

            const req: any = { headers: { authorization: token } };
            jest.spyOn(accountService, 'getIdAccount').mockResolvedValue(account);

            const result = await accountController.findOne(id, req);

            expect(accountService.getIdAccount).toHaveBeenCalledWith(id);
            expect(result).toBe(account);
        });
    });

    describe('findByEmail', () => {
        it('should return the account with the specified email', async () => {
            const email = 'test@example.com';
            const token = 'mocked_token';
            const account = { /* mock account object */ };
            const req: any = { headers: { authorization: token } };
            jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValue(undefined);
            jest.spyOn(accountService, 'getBiAccount').mockResolvedValue(account);

            const result = await accountController.findByEmail(email, req);

            expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
            expect(accountService.getBiAccount).toHaveBeenCalledWith(email);
            expect(result).toBe(account);
        });
    });

    describe('remove', () => {
        it('should remove the account with the specified id', async () => {
            const id = 'account_id';
            const token = 'mocked_token';
            const user = [{ _id: 'user_id' }];

            const req: any = { headers: { authorization: token } };
            jest.spyOn(authenticator, 'checkUserAndRole').mockResolvedValue(user);
            jest.spyOn(accountService, 'removeAccount').mockResolvedValue(undefined);

            const result = await accountController.remove(id, req);

            expect(authenticator.checkUserAndRole).toHaveBeenCalledWith(token);
            expect(accountService.removeAccount).toHaveBeenCalledWith(id);
            expect(result).toBeUndefined();
        });
    });

})