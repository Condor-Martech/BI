import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalysisConversationDocument = AnalysisConversation & Document;

/**
 * Uma conversa de análise (chat) sobre um relatório Power BI.
 *
 * Persistida em Mongo: cada turno (user + assistant) é anexado a `messages`.
 * A mensagem do assistant pode carregar `charts` (specs de gráfico geradas pelo
 * LLM) e `daxRuns` (trazabilidade das queries DAX daquele turno).
 *
 * Escopada por `userId` para a listagem "minhas conversas" — note que isto é
 * apenas escopo de UX, NÃO de segurança: o módulo todo roda com o token de
 * serviço sem RLS (dívida consciente).
 */
@Schema({ timestamps: true, versionKey: false })
export class AnalysisConversation {
  @Prop({ index: true })
  reportId: string;

  @Prop()
  reportName: string;

  @Prop()
  datasetId: string;

  @Prop()
  groupId: string;

  @Prop({ index: true })
  userId: string;

  @Prop()
  userEmail: string;

  @Prop({ default: 'pt-BR' })
  language: string;

  /** Título curto derivado da primeira mensagem do usuário. */
  @Prop()
  title: string;

  /**
   * Turnos da conversa, em ordem cronológica. Cada item:
   *   { role: 'user'|'assistant', content: string, charts?: ChartSpec[], daxRuns?: any[], createdAt: Date }
   * Armazenado como objeto livre (`[Object]`) para não acoplar o schema às specs
   * de gráfico, que evoluem do lado do prompt.
   */
  @Prop({ type: [Object], default: [] })
  messages: any[];

  @Prop()
  model: string;

  @Prop({ default: 0 })
  totalTokens: number;

  @Prop({ default: 0 })
  estimatedCostUsd: number;

  /** 'success' | 'partial' | 'failed' do último turno. */
  @Prop({ default: 'success' })
  status: string;
}

export const AnalysisConversationSchema = SchemaFactory.createForClass(AnalysisConversation);
