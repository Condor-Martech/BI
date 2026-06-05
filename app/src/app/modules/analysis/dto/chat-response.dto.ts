import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DaxQueryDto, AnalysisUsageDto } from './analysis-response.dto';

export class ChartSeriesDto {
  @ApiProperty({ description: 'Nome do campo numérico em `data` a plotar.', example: 'vendas' })
  key: string;

  @ApiPropertyOptional({ description: 'Rótulo de exibição da série.', example: 'Vendas (R$)' })
  label?: string;
}

export class ChartSpecDto {
  @ApiProperty({ example: 'Vendas por mês' })
  title: string;

  @ApiProperty({ enum: ['bar', 'line', 'area', 'pie'], example: 'bar' })
  type: string;

  @ApiProperty({
    description: 'Pontos de dados; cada objeto é um ponto. Ex.: [{ "mes": "Jan", "vendas": 1200 }]',
    type: 'array',
    items: { type: 'object' },
  })
  data: any[];

  @ApiProperty({ description: 'Campo categórico/eixo X presente em cada ponto.', example: 'mes' })
  xKey: string;

  @ApiProperty({ description: 'Séries numéricas a plotar.', type: [ChartSeriesDto] })
  series: ChartSeriesDto[];
}

export class ChatResponseDto {
  @ApiProperty({ description: 'ID da conversa (criada ou continuada).', example: '6685a57d6dddeaa56c4a5f15' })
  conversationId: string;

  @ApiProperty({ description: 'Resposta conversacional do assistente.' })
  reply: string;

  @ApiProperty({ description: 'Gráficos gerados neste turno (pode ser vazio).', type: [ChartSpecDto] })
  charts: ChartSpecDto[];

  @ApiProperty({ description: 'Queries DAX executadas neste turno (trazabilidade).', type: [DaxQueryDto] })
  daxQueries: DaxQueryDto[];

  @ApiProperty({ description: 'Uso de tokens e custo estimado deste turno.', type: AnalysisUsageDto })
  usage: AnalysisUsageDto;

  @ApiProperty({ description: "'success' | 'partial' | 'failed'", example: 'success' })
  status: string;
}

export class ConversationListItemDto {
  @ApiProperty({ example: '6685a57d6dddeaa56c4a5f15' })
  _id: string;

  @ApiProperty({ example: 'Análise geral de vendas' })
  title: string;

  @ApiProperty({ example: 4 })
  messageCount: number;

  @ApiProperty({ example: '2026-06-05T19:13:10.000Z' })
  updatedAt: string;
}
