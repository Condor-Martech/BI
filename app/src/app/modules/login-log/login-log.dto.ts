import { UserRelatedResponseDto } from "../users/dto/create-user.dto";
import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";


export class LoginLogsResponseDto {
  @ApiProperty({ description: 'ID MongoDB do registro de login', example: '6685a57d6dddeaa56c4a5f15' })
  @IsString()
  _id: string;

  @ApiProperty({ description: 'Dados do usuário que realizou o login (populado)', type: UserRelatedResponseDto })
  user: UserRelatedResponseDto;

  @ApiProperty({ description: 'Data e hora do login no formato de string da plataforma', example: 'Wed Jul 03 2024 18:03:38 GMT-0300 (Brasilia Standard Time)' })
  @IsString()
  loginTime: string;


}

export class LoginLogUserSummaryDto {
  @ApiProperty({ description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
  @IsString()
  _id: string;

  @ApiProperty({ description: 'Nome do usuário', example: 'Mayane Oliveira' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'E-mail do usuário', example: 'mayane@condor.com.br' })
  @IsString()
  email: string;

  @ApiProperty({ description: 'Função do usuário', example: 'user', enum: ['manager', 'admin', 'user'] })
  @IsString()
  role: string;

  @ApiProperty({ description: 'Quantidade total de logins registrados', example: 12 })
  accesos: number;

  @ApiProperty({
    description: 'Data/hora do último login registrado. Pode vir como string legada da plataforma ou null se nunca logou.',
    example: 'Wed Jul 03 2024 18:03:38 GMT-0300 (Brasilia Standard Time)',
    nullable: true,
  })
  ultimoAcceso: string | null;
}