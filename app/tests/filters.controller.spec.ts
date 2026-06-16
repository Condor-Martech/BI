import { FiltersController } from './../src/app/modules/filters/filters.controller';
import { FiltersService } from '../src/app/modules/filters/filters.service';
import { Filter } from "../src/app/modules/filters/entities/filter.entity";
import { UsersService } from '../src/app/modules/users/users.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateFilterDto } from '../src/app/modules/filters/dto/create-filter.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Authenticator } from '../src/app/core/utils/authenticator';

export const FiltersList: Filter[] = [
  new Filter({
    table: 'Vendas.test',
    column: 'tests',
    value: ['valor1', "valor2"]
  }),
  new Filter({
    table: 'Vendas.test',
    column: 'tests',
    value: ['valor1', "valor2"]
  }),
  new Filter({
    table: 'Vendas.test',
    column: 'tests',
    value: ['valor1', "valor2"]
  })
]

describe('FilterController', () => {
  let filtersController: FiltersController;
  let filtersService: FiltersService;
  let usersService: UsersService;
  let authenticator: Authenticator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FiltersController],
      providers: [
        {
          provide: FiltersService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            updateFilter: jest.fn(),
            remove: jest.fn()
          }
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
            remove: jest.fn(),
          }
        }, {
          provide: Authenticator,
          useValue: {
            generate: jest.fn(),
            getTokenData: jest.fn(),
            checkUserAndRole: jest.fn()
          }
        },
      ]
    }).compile();

    filtersController = module.get<FiltersController>(FiltersController);
    filtersService = module.get<FiltersService>(FiltersService);
    usersService = module.get<UsersService>(UsersService);
    authenticator = module.get<Authenticator>(Authenticator);
  })

  it('should be defined', () => {
    expect(filtersController).toBeDefined();
    expect(filtersService).toBeDefined();
  });

  describe('create', () => {
    it('should throw an error if user is not found', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };
      const dto: CreateFilterDto = { userId: 'someId', column: 'teste', table: 'tests', value: '1, 2' };
      jest.spyOn(filtersService, 'findOne').mockResolvedValue(null);
      const errorResult = new HttpException('Usuário não encontrado', HttpStatus.BAD_REQUEST)
      await expect(filtersController.create(req, dto)).rejects.toThrowError(errorResult);
    });

    it('should create a filter if user is found', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };
      const dto: CreateFilterDto = { userId: 'someId', column: 'teste', table: 'tests', value: '1, 2' };
      const userFromDB: any = { _id: 'userId', name: 'John Doe', email: 'johndoe@example.com', role: "user", };

      jest.spyOn(usersService, 'findOne').mockResolvedValue(userFromDB);
      jest.spyOn(filtersService, 'create').mockResolvedValue(FiltersList[0]);

      expect(await filtersController.create(req, dto)).toBe(FiltersList[0]);
    });
  });

  describe('findAll', () => {
    it('should return all filters', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };

      jest.spyOn(filtersService, 'findAll').mockResolvedValue(FiltersList);

      expect(await filtersController.findAll(req)).toBe(FiltersList);
    });
  });

  describe('findOne', () => {
    it('should return a filter by id', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };

      jest.spyOn(filtersService, 'findOne').mockResolvedValue(FiltersList[1]);

      expect(await filtersController.findOne(req, 'someId')).toBe(FiltersList[1]);
    });
  });

  describe('update', () => {
    it('should update a filter', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };
      const result = 'updated';
      jest.spyOn(filtersService, 'updateFilter').mockResolvedValue(result);

      expect(await filtersController.update(req, 'someId', {})).toBe(result);
    });
  });

  describe('remove', () => {
    it('should remove a filter', async () => {
      const token = 'Bearer token';
      const req: any = { headers: { authorization: token } };
      const filterID = '1';
      await expect(filtersController.remove(req, filterID)).resolves.toBeUndefined();
      expect(filtersService.remove).toHaveBeenCalledTimes(1);
      expect(filtersService.remove).toHaveBeenCalledWith(filterID);
    });
  });
})
