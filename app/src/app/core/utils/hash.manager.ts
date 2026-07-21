import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomInt } from "crypto";

@Injectable()
export class HashManager {
    public async hash(text: string): Promise<string> {
        const rounds = Number(process.env.BCRYPT_COST)
        const salt = await bcrypt.genSalt(rounds)
        return bcrypt.hash(text, salt);
    }

    public async compare(text: string, hash: string): Promise<boolean> {
        return bcrypt.compare(text, hash)
    }
    public generatePassword(length: number = 8): string {
        const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters[randomInt(0, characters.length)];
        }
        return result;
    }
}

