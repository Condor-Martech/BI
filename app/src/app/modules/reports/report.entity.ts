import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";

export type ReportDocument = Report & Document;
@Schema({
    timestamps: true,
    versionKey: false
})
export class Report {

    @Prop()
    reportIdPB: string;

    @Prop()
    name: string;

    @Prop()
    webUrl: string;

    @Prop()
    embedUrl: string

    @Prop()
    isOwnedByMe: boolean;

    @Prop()
    datasetId: string;

    @Prop()
    groupIdPB?: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' }] })
    accountID?: string

    // Soft-hide: MANAGER pode ocultar um relatório da listagem sem apagá-lo do
    // Power BI. O sync preserva o flag reaplicando-o após repopular a coleção.
    // Indexado porque toda listagem "não oculto" filtra por este campo.
    @Prop({ default: false, index: true })
    hiddenByAdmin: boolean;

    @Prop({ type: Date, default: null })
    hiddenAt: Date | null;

    @Prop({ type: String, default: null })
    hiddenBy: string | null;


    constructor(report?: Partial<Report>) {
        this.reportIdPB = report?.reportIdPB;
        this.name = report?.name;
        this.webUrl = report?.webUrl;
        this.embedUrl = report?.embedUrl;
        this.isOwnedByMe = report?.isOwnedByMe;
        this.datasetId = report?.datasetId;
        this.groupIdPB = report?.groupIdPB

    }
}
export const ReportSchema = SchemaFactory.createForClass(Report);


