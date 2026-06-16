import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { FavouritesService } from '../src/app/modules/favourites/favourites.service';
import { Favourite } from '../src/app/modules/favourites/favourite.entity';
import { ReportsService } from '../src/app/modules/reports/reports.service';
import { UsersService } from '../src/app/modules/users/users.service';
import { EventsService } from '../src/app/modules/events/events.service';

/**
 * Spec enfocado no hardening do módulo favourites:
 *  - update/remove só afetam favoritos do próprio usuário (scope por userID).
 *  - create grava o userID vindo do token, não do body.
 *  - findAll devolve [] (não 404) quando não há favoritos.
 *  - erros conhecidos não são mascarados como 500.
 */
describe('FavouritesService — hardening (scope por usuário)', () => {
  let service: FavouritesService;

  const favouriteModel: any = jest.fn();
  const userServiceMock = { findOne: jest.fn() };
  const reportServiceMock = { findOne: jest.fn(), findOneByID: jest.fn() };
  const eventsServiceMock = { trackFavouriteAdded: jest.fn(), trackFavouriteRemoved: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock do construtor: `new this.favouriteModel(doc)` devolve um doc com .save().
    favouriteModel.mockImplementation((doc: any) => ({
      ...doc,
      save: jest.fn().mockResolvedValue({ _id: 'fav-novo', ...doc }),
    }));
    favouriteModel.find = jest.fn();
    favouriteModel.findOneAndUpdate = jest.fn();
    favouriteModel.findOneAndDelete = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavouritesService,
        { provide: getModelToken(Favourite.name), useValue: favouriteModel },
        { provide: UsersService, useValue: userServiceMock },
        { provide: ReportsService, useValue: reportServiceMock },
        { provide: EventsService, useValue: eventsServiceMock },
      ],
    }).compile();

    service = module.get<FavouritesService>(FavouritesService);
  });

  describe('update — só afeta favoritos do próprio usuário', () => {
    it('rejeita com NotFoundException quando o favorito não pertence ao usuário', async () => {
      favouriteModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.update('fav1', 'userB', { order: 2 })).rejects.toThrow(NotFoundException);
      expect(favouriteModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'fav1', userID: 'userB' },
        { $set: { order: 2 } },
        { new: true },
      );
    });

    it('atualiza quando o favorito pertence ao usuário', async () => {
      const updated = { _id: 'fav1', userID: 'userA', order: 2 };
      favouriteModel.findOneAndUpdate.mockResolvedValue(updated);

      await expect(service.update('fav1', 'userA', { order: 2 })).resolves.toEqual(updated);
    });
  });

  describe('remove — só afeta favoritos do próprio usuário', () => {
    it('rejeita com NotFoundException quando nada foi deletado (favorito alheio/inexistente)', async () => {
      favouriteModel.findOneAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('fav1', 'userB')).rejects.toThrow(NotFoundException);
      expect(favouriteModel.findOneAndDelete).toHaveBeenCalledWith({ _id: 'fav1', userID: 'userB' });
    });

    it('remove quando o favorito pertence ao usuário', async () => {
      favouriteModel.findOneAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'fav1', userID: 'userA', reportIdPB: 'r1' }),
      });

      await expect(service.remove('fav1', 'userA')).resolves.toEqual({ deletedCount: 1 });
    });
  });

  describe('create — usa o userID do token', () => {
    it('grava o favorito com o userID recebido, não um valor do body', async () => {
      userServiceMock.findOne.mockResolvedValue({ _id: 'userA', email: 'a@x.com' });
      reportServiceMock.findOneByID.mockResolvedValue({ reportIdPB: 'r1' });

      await service.create('userA', { reportIdPB: 'r1', order: 1 });

      expect(favouriteModel).toHaveBeenCalledWith(
        expect.objectContaining({ userID: 'userA', reportIdPB: 'r1', order: 1 }),
      );
    });

    it('re-lança NotFoundException sem mascarar como 500 quando o usuário não existe', async () => {
      userServiceMock.findOne.mockResolvedValue(null);

      await expect(service.create('userA', { reportIdPB: 'r1', order: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll — lista vazia', () => {
    it('devolve [] quando o usuário não tem favoritos (não 404)', async () => {
      userServiceMock.findOne.mockResolvedValue({ _id: 'userA', email: 'a@x.com' });
      favouriteModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      });

      await expect(service.findAll('userA')).resolves.toEqual([]);
      expect(favouriteModel.find).toHaveBeenCalledWith({ userID: 'userA' });
    });
  });

  describe('findAll — favoritos órfãos', () => {
    const baseFav = (reportIdPB: string, order: number) => ({
      _id: `fav-${reportIdPB}`,
      userID: 'userA',
      reportIdPB,
      order,
    });
    const baseReport = (reportIdPB: string) => ({
      reportIdPB,
      name: `Report ${reportIdPB}`,
      embedUrl: `https://embed/${reportIdPB}`,
      groupIdPB: 'g1',
      accountID: [{ nameAccount: 'AcctA', email: 'acct@x.com', token: 'tk' }],
    });

    it('ignora favoritos cujo reportIdPB não existe mais e devolve apenas os válidos', async () => {
      userServiceMock.findOne.mockResolvedValue({ _id: 'userA', email: 'a@x.com' });
      favouriteModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([baseFav('rOK', 1), baseFav('rGONE', 2)]),
        }),
      });
      reportServiceMock.findOne.mockImplementation(async (reportIdPB: string) => {
        if (reportIdPB === 'rGONE') {
          throw new NotFoundException(`Nenhum relatorio foi encontrado com ID : ${reportIdPB}`);
        }
        return baseReport(reportIdPB);
      });

      const result = await service.findAll('userA');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ _id: 'fav-rOK', reportIdPB: 'rOK' });
      expect(result[0].report).toMatchObject({ reportIdPB: 'rOK', name: 'Report rOK' });
    });

    it('re-lança erros inesperados do reports.service (não mascara como 200)', async () => {
      userServiceMock.findOne.mockResolvedValue({ _id: 'userA', email: 'a@x.com' });
      favouriteModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([baseFav('rBOOM', 1)]),
        }),
      });
      reportServiceMock.findOne.mockRejectedValue(new Error('mongo down'));

      await expect(service.findAll('userA')).rejects.toThrow(/mongo down/);
    });
  });
});
