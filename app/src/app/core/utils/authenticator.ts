import { HttpException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { User, UserDocument } from "../../modules/users/user.entity";
import { InjectModel } from "@nestjs/mongoose";
import * as jwt from "jsonwebtoken";
import { Model } from "mongoose";

export interface authenticationData {
    id: string,
    email: string,
    role: string,
    // Opcional: incluido en tokens nuevos para que el frontend muestre el nombre
    // real ("Francisco Araújo") en vez de derivarlo del email. Tokens antiguos no
    // lo tienen — el frontend cae al fallback derivado del email hasta re-login.
    name?: string,
}

@Injectable()
export class Authenticator {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>
    ) { }

    public async validateTokenAndGetUser(token: string) {
        try {
            if (!token) {
                throw new UnauthorizedException('Necessário estar logado para usar o endpoint');
            }

            const tokenData = this.getTokenData(token);

            const user = await this.userModel.findById(tokenData.id);
            if (!user) {
                throw new NotFoundException('Usuário não encontrado');
            }
            return user;
        } catch (error) {
            // Preserva 401/404 lançados acima (token inválido, usuário inexistente).
            // Só erros realmente inesperados viram 500.
            if (error instanceof HttpException) {
                throw error;
            }
            throw new InternalServerErrorException(error.message);
        }
    }

    public generate(input: authenticationData): string {
        const token = jwt.sign(input, process.env.JWT_SECRET as string, {
            expiresIn: process.env.JWT_EXPIRES_IN || '20h',
        });
        return token;
    }

    public getTokenData(token: string): authenticationData {
        try {
            const jwtToken = token.split('Bearer ')[1];
            const tokenData = jwt.verify(jwtToken, process.env.JWT_SECRET as string) as authenticationData;
            return tokenData;
        } catch (error) {
            throw new UnauthorizedException('Erro na autenticação do usuário');
        }
    }
}
