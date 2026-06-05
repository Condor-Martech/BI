import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateUserGroupDto {
  @ApiPropertyOptional({ description: 'Novo nome do grupo de usuários', example: 'Grupo Financeiro Atualizado' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Novo ID da conta BI associada ao grupo', example: '6685a57d6dddeaa56c4a5f15' })
  @IsString()
  @IsOptional()
  accountID?: string;

  @ApiPropertyOptional({ description: 'Nova lista de IDs de relatórios Power BI do grupo', type: [String], example: ['6e277bac-97e4-43cc-ad65-b96dbdd65f57'] })
  @IsArray()
  @IsOptional()
  reports?: string[];

  @ApiPropertyOptional({ description: 'Lista completa de IDs de usuários membros do grupo (substitui a anterior)', type: [String], example: ['6685a57d6dddeaa56c4a5f15'] })
  @IsArray()
  @IsOptional()
  usersIds?: string[];
}
