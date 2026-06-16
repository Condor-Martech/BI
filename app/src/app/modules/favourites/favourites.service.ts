import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Favourite, FavouriteDocument } from './favourite.entity';
import { UpdateFavouriteDto } from './dto/update-favourite.dto';
import { CreateFavouriteDto } from './dto/create-favourite.dto';
import { ReportsService } from '../reports/reports.service';
import { Model, Error as MongooseError } from 'mongoose';
import { UsersService } from './../users/users.service';
import { InjectModel } from '@nestjs/mongoose';
import { EventsService } from '../events/events.service';


@Injectable()
export class FavouritesService {
  private readonly logger = new Logger(FavouritesService.name);

  constructor(
    @InjectModel(Favourite.name) private favouriteModel: Model<FavouriteDocument>,
    private readonly userService: UsersService,
    private readonly reportService: ReportsService,
    private readonly events: EventsService,
  ) { }


  async create(userID: string, createFavouriteDto: CreateFavouriteDto): Promise<Favourite> {
    try {
      const user = await this.userService.findOne(userID);
      if (!user) {
        throw new NotFoundException(`User com ID ${userID} não encontrado`);
      }
      const report = await this.reportService.findOneByID(createFavouriteDto.reportIdPB);
      if (!report) {
        throw new NotFoundException(`Report com ID ${createFavouriteDto.reportIdPB} não encontrado`);
      }
      const favourite = new this.favouriteModel({ ...createFavouriteDto, userID });
      const saved = await favourite.save();
      this.events.trackFavouriteAdded({ userId: userID }, createFavouriteDto.reportIdPB);
      return saved;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // E11000: o índice unique (userID + reportIdPB) já tem esse favorito.
      if (error?.code === 11000) {
        throw new ConflictException('Relatório já está nos favoritos deste usuário.');
      }
      this.logger.error(`Falha ao criar favorito (user=${userID}, report=${createFavouriteDto.reportIdPB}): ${error.message}`, error.stack);
      throw new InternalServerErrorException(error.message);
    }
  }
  async findAll(userID: string): Promise<any> {
    try {
      const user = await this.userService.findOne(userID);
      const favourites = await this.favouriteModel.find({ userID }).sort({ order: 1 }).exec();

      // Favoritos órfãos (reportIdPB que não existe mais em `reports`, p.ex. após resync ou delete)
      // não devem derrubar a lista inteira. Usamos allSettled e filtramos os ausentes.
      const settled = await Promise.all(
        favourites.map(async (favourite) => {
          try {
            const report = await this.reportService.findOne(favourite.reportIdPB, user.email);
            return { favourite, report };
          } catch (err) {
            if (err instanceof NotFoundException) {
              this.logger.warn(
                `Favorito órfão ignorado (user=${userID}, reportIdPB=${favourite.reportIdPB}): ${err.message}`,
              );
              return null;
            }
            throw err;
          }
        })
      );

      type SettledEntry = NonNullable<(typeof settled)[number]>;
      const favouriteReports = settled
        .filter((entry): entry is SettledEntry => entry !== null)
        .map(({ favourite, report }) => {
          const account = Array.isArray(report.accountID) && report.accountID.length > 0
            ? report.accountID[0]
            : null;
          return {
            _id: favourite._id,
            userID: favourite.userID,
            reportIdPB: favourite.reportIdPB,
            order: favourite.order,
            report: {
              reportIdPB: report.reportIdPB,
              name: report.name,
              embedUrl: report.embedUrl,
              groupIdPB: report.groupIdPB,
              account: account ? {
                nameAccount: account.nameAccount,
                email: account.email,
                token: account.token,
              } : null,
            }
          };
        });

      return favouriteReports;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message);
    }
  }



  async findOne(favouriteId: string, userID: string): Promise<any> {
    try {
      const user = await this.userService.findOne(userID);
      if (!user) {
        throw new NotFoundException(`User com ID ${userID} não encontrado`);
      }

      const favourite = await this.favouriteModel.findOne({ _id: favouriteId, userID }).exec();
      if (!favourite) {
        throw new NotFoundException(`Favourite with ID ${favouriteId} not found`);
      }

      const report = await this.reportService.findOne(favourite.reportIdPB, user.email);
      const account = Array.isArray(report.accountID) && report.accountID.length > 0
        ? report.accountID[0]
        : null;
      const favouriteReport = {
        _id: favourite._id,
        userID: favourite.userID,
        reportIdPB: favourite.reportIdPB,
        order: favourite.order,
        report: {
          reportIdPB: report.reportIdPB,
          name: report.name,
          embedUrl: report.embedUrl,
          groupIdPB: report.groupIdPB,
          account: account ? {
            id: account._id,
            nameAccount: account.nameAccount,
            email: account.email,
            token: account.token,
          } : null,
        }
      };

      return favouriteReport;

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Favourite with ID ${favouriteId} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }

  async update(id: string, userID: string, updateFavouriteDto: UpdateFavouriteDto) {
    try {
      const updated = await this.favouriteModel.findOneAndUpdate(
        { _id: id, userID },
        { $set: updateFavouriteDto },
        { new: true },
      );
      if (!updated) {
        throw new NotFoundException(`Favourite with ID ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Favourite with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }

  async remove(id: string, userID: string): Promise<any> {
    try {
      const removed = await this.favouriteModel.findOneAndDelete({ _id: id, userID }).exec();
      if (!removed) {
        throw new NotFoundException(`Favourite with ID ${id} not found`);
      }
      this.events.trackFavouriteRemoved({ userId: userID }, removed.reportIdPB);
      return { deletedCount: 1 };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException(`Invalid ID format: ${error.message}`);
      }
      if (error instanceof MongooseError.DocumentNotFoundError) {
        throw new NotFoundException(`Favourite with ID ${id} not found: ${error.message}`);
      }
      throw new InternalServerErrorException(`Unexpected error: ${error.message}`);
    }
  }
}

