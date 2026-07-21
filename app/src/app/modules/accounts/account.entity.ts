import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from 'mongoose';

export type AccountDocument = Account & Document;

@Schema({
    timestamps: true,
    versionKey: false
})
export class Account {
    @Prop()
    nameAccount: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    pass: string;

    @Prop({ required: true })
    clientId: string;

    @Prop({ required: true })
    clientSecret: string;

    @Prop()
    tenantId: string;

    @Prop()
    token: string;

    @Prop()
    refreshToken: string;

    @Prop()
    expiresIn: string;

    @Prop()
    expiresOn: string;

    @Prop()
    userCount: number;

    @Prop()
    groupCount: number;

    @Prop()
    reportCount: number;

    @Prop()
    users: string[]

    // Estado do último sync desta conta. Escrito pelo ReportSyncConsumer nos
    // hooks OnQueueActive/Completed/Failed. Serve pra pintar um badge com
    // tooltip na UI (accounts/page.tsx) sem depender do canal SSE — persiste
    // entre sessões e sobrevive a reloads.
    @Prop({
        type: {
            state: { type: String, enum: ['ok', 'failed', 'in_progress'] },
            lastError: String,
            lastErrorAt: Date,
            lastSuccessAt: Date,
            lastJobId: String,
            attemptsMade: Number,
        },
        default: null,
        _id: false,
    })
    syncStatus?: {
        state: 'ok' | 'failed' | 'in_progress';
        lastError?: string;
        lastErrorAt?: Date;
        lastSuccessAt?: Date;
        lastJobId?: string;
        attemptsMade?: number;
    };

}
export const AccountSchema = SchemaFactory.createForClass(Account);