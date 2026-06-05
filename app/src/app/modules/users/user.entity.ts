import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";

export type UserDocument = User & Document;
@Schema({
    timestamps: true,
    versionKey: false
})
export class User {
    @Prop()
    name: string;

    @Prop()
    password: string;

    @Prop({ unique: true })
    email: string;

    @Prop()
    role: string;

    @Prop()
    userIslv: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'accounts' }], index: true })
    accountID?: string[];

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'accounts' }] })
    filterId?: string[];

    @Prop()
    groupByPB?: string[];

    @Prop()
    reportsByPB?: string[];

    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'UserGroups' })
    userGroups?: string;

    // Hash bcrypt do token de convite. Set durante create()/resendWelcome(),
    // cleared quando o usuário define a senha em POST /users/set-password.
    @Prop()
    invitationTokenHash?: string;

    // TTL do convite (48h por padrão). Comparamos contra Date.now() em setPassword().
    @Prop()
    invitationExpiresAt?: Date;

    @Prop({ type: Date, index: true })
    lastLogin?: Date;

    // Habilita o módulo de Análise com IA (sidebar de analítica no front + endpoints /analysis).
    // Padrão false: o recurso fica oculto/bloqueado até um admin ativá-lo explicitamente.
    @Prop({ default: false })
    chatIaEnabled?: boolean;


    constructor(user?: Partial<User>) {
        this.name = user?.name;
        this.password = user?.password;
        this.email = user?.email;
        this.role = user?.role;
        this.accountID = user?.accountID;
        this.groupByPB = user?.groupByPB;
        this.reportsByPB = user?.reportsByPB;
    }

}
export const UserSchema = SchemaFactory.createForClass(User)
UserSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

UserSchema.virtual('group', {
    ref: 'Group',
    localField: 'groupByPB',
    foreignField: 'groupIdPB',
    justOne: false,
});

UserSchema.virtual('report', {
    ref: 'Report',
    localField: 'reportsByPB',
    foreignField: 'reportIdPB',
    justOne: false,
});

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });
