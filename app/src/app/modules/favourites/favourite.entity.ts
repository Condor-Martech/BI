import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";


export type FavouriteDocument = Favourite & Document;

@Schema({ timestamps: true, versionKey: false, })

export class Favourite {
  @Prop({ required: true })
  userID: string;

  @Prop({ required: true })
  reportIdPB: string;

  @Prop({ required: true })
  order: number;
}


export const FavouriteSchema = SchemaFactory.createForClass(Favourite);

FavouriteSchema.virtual('report', {
  ref: 'Report',
  localField: 'reportIdPB',
  foreignField: 'reportIdPB',
  justOne: false,
});

FavouriteSchema.set('toObject', { virtuals: true });
FavouriteSchema.set('toJSON', { virtuals: true });

// Um usuário não pode favoritar o mesmo relatório duas vezes.
// `order` NÃO é unique (era um índice órfão `order_1` global que causava E11000).
FavouriteSchema.index({ userID: 1, reportIdPB: 1 }, { unique: true });