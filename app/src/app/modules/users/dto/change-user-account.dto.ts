import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class ChangeUserAccountDto {
    @ApiProperty({
        description: 'ID MongoDB da conta BI de destino. O usuário é removido das contas atuais e vinculado a esta.',
        example: '6685a57d6dddeaa56c4a5f15',
    })
    @IsMongoId({ message: 'accountId deve ser um ObjectId válido' })
    @IsNotEmpty({ message: 'accountId é campo obrigatório' })
    accountId: string;
}
