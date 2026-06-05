import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AnalysisLanguage } from './analyze-report.dto';

/** Body de POST /analysis/report/:reportId/chat — um turno da conversa. */
export class ChatReportDto {
  @ApiPropertyOptional({
    description:
      'ID da conversa a continuar. Se omitido, uma nova conversa é criada e seu ID retorna na resposta.',
    example: '6685a57d6dddeaa56c4a5f15',
  })
  @IsOptional()
  @IsMongoId()
  conversationId?: string;

  @ApiProperty({
    description: 'Mensagem do usuário para este turno.',
    example: 'Faça uma análise geral deste relatório.',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    enum: AnalysisLanguage,
    default: AnalysisLanguage.PT_BR,
    description: 'Idioma das respostas do assistente (aplicado a partir deste turno).',
    example: 'pt-BR',
  })
  @IsOptional()
  @IsEnum(AnalysisLanguage)
  language?: AnalysisLanguage;
}
