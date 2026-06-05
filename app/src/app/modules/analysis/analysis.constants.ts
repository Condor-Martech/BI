/**
 * Constantes, prompts e schema de tool do módulo de análise com IA.
 * Mantidos em um único lugar para facilitar tuning sem tocar a lógica.
 */

export const ANALYSIS_LIMITS = {
  /** Teto de rodadas do loop agéntico (tool-calls). */
  MAX_TOOL_ITERATIONS: 4,
  /** Linhas devolvidas ao modelo por query DAX (no loop). */
  MAX_ROWS_TO_MODEL: 200,
  /** Linhas persistidas em daxRuns para trazabilidade. */
  MAX_ROWS_TO_PERSIST: 50,
  /** Timeout por executeQueries. */
  DAX_QUERY_TIMEOUT_MS: 30_000,
  /** Timeout global do cliente OpenAI. */
  OPENAI_TIMEOUT_MS: 90_000,
  /** Tamanho máximo aceito de uma query DAX gerada. */
  DAX_QUERY_MAX_CHARS: 4000,
};

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

/**
 * Estimativa de custo USD por 1M tokens. Aproximada — útil para tracking,
 * não é uma fatura. Modelo fora da tabela → custo 0.
 */
export const OPENAI_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = OPENAI_PRICING_USD_PER_1M[model];
  if (!p) return 0;
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

/**
 * Chaves de cache locais ao módulo. Formato `analysis:<scope>:<id>` —
 * mesma convenção do cache.keys.ts compartilhado, declarado aqui para
 * manter o módulo aditivo (sem editar arquivos compartilhados).
 */
export const ANALYSIS_CACHE = {
  latestReport: (reportIdPB: string): string => `analysis:report:${reportIdPB}`,
  /** Digest do schema do dataset — caro de descobrir (3 INFO queries), cacheado por relatório. */
  schema: (reportIdPB: string): string => `analysis:schema:${reportIdPB}`,
};

/** Limites do contrato de gráficos emitido pelo LLM (sanitizados no backend). */
export const CHART_LIMITS = {
  MAX_CHARTS: 4,
  MAX_DATA_POINTS: 100,
  MAX_SERIES: 5,
  ALLOWED_TYPES: ['bar', 'line', 'area', 'pie'] as const,
};

/** Schema da única tool exposta ao OpenAI no loop agéntico. */
export const RUN_DAX_TOOL: any = {
  type: 'function',
  function: {
    name: 'run_dax_query',
    description:
      'Executa uma query DAX read-only contra o dataset Power BI do relatório em análise e retorna as linhas resultantes. ' +
      'A query DEVE começar com EVALUATE ou DEFINE e DEVE limitar resultados (TOPN(1000, ...) ou agregações via SUMMARIZECOLUMNS/SUMMARIZE/GROUPBY) — ' +
      `o backend trunca em ${ANALYSIS_LIMITS.MAX_ROWS_TO_MODEL} linhas no retorno ao modelo. ` +
      'Use para coletar dados reais que sustentem o análise narrativo. Priorize agregações sobre EVALUATE de tabelas inteiras.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A query DAX a executar. Deve começar com EVALUATE ou DEFINE.',
        },
        purpose: {
          type: 'string',
          description: 'Frase curta explicando o insight pretendido.',
        },
      },
      required: ['query', 'purpose'],
      additionalProperties: false,
    },
  },
};

export function buildSystemPrompt(language: string, focus?: string): string {
  const lang = language === 'en-US' ? 'English (en-US)' : 'Brazilian Portuguese (pt-BR)';
  const lines = [
    'You are a senior data analyst inspecting a Microsoft Power BI report.',
    'You have one tool: `run_dax_query` — use it to fetch real numbers from the dataset.',
    'Goal: surface the most relevant insights about the data — totals, trends, top categories, anomalies, comparisons over time — grounded in REAL values returned by your queries.',
    'Strategy: (1) inspect the schema given to you; (2) request 2-4 focused DAX queries that aggregate (SUMMARIZECOLUMNS, SUMMARIZE) or rank (TOPN) — avoid dumping raw tables; (3) when you have enough evidence, stop calling tools and produce the analysis.',
    `Hard limit: at most ${ANALYSIS_LIMITS.MAX_TOOL_ITERATIONS} tool-calling rounds.`,
  ];
  if (focus) lines.push(`User focus for this analysis: ${focus}`);
  lines.push(`Write the final analysis in ${lang}. Be specific, cite numbers, avoid generalities.`);
  return lines.join('\n');
}

export function buildFinalUserPrompt(language: string): string {
  if (language === 'en-US') {
    return (
      'Based on everything you have gathered, produce the final analysis as a JSON object with EXACTLY these keys: ' +
      '"summary" (string, 2-4 sentence executive summary), ' +
      '"keyFindings" (array of strings, 3-6 specific findings citing numbers), ' +
      '"anomalies" (array of strings, 0-4 anomalies/red flags or empty if none), ' +
      '"recommendations" (array of strings, 2-4 actionable suggestions). ' +
      'Write all values in English. Respond ONLY with the JSON object.'
    );
  }
  return (
    'Com base em tudo que você coletou, produza o análise final como um objeto JSON com EXATAMENTE estas chaves: ' +
    '"summary" (string, resumo executivo de 2-4 frases), ' +
    '"keyFindings" (array de strings, 3-6 achados específicos citando números), ' +
    '"anomalies" (array de strings, 0-4 anomalias/alertas ou vazio se não houver), ' +
    '"recommendations" (array de strings, 2-4 sugestões acionáveis). ' +
    'Escreva todos os valores em português do Brasil. Responda APENAS com o objeto JSON.'
  );
}

// ----- Chat conversacional -----

/**
 * System prompt do modo chat. Mesmo agente analista, mas conversacional: mantém
 * o contexto dos turnos anteriores e pode emitir gráficos quando ajudam a resposta.
 */
export function buildChatSystemPrompt(language: string, reportName?: string, focus?: string): string {
  const lang = language === 'en-US' ? 'English (en-US)' : 'Brazilian Portuguese (pt-BR)';
  const lines = [
    'You are a senior data analyst having a conversation with a user about a Microsoft Power BI report' +
      (reportName ? ` named "${reportName}".` : '.'),
    'You have one tool: `run_dax_query` — use it to fetch REAL numbers from the dataset before answering.',
    'Maintain the conversation context: the user may ask follow-up questions that refer to previous turns.',
    'Strategy per turn: (1) decide if you need fresh data; (2) if so, request focused DAX queries that ' +
      'aggregate (SUMMARIZECOLUMNS, SUMMARIZE) or rank (TOPN) — never dump raw tables; (3) then answer.',
    `Hard limit: at most ${ANALYSIS_LIMITS.MAX_TOOL_ITERATIONS} tool-calling rounds per turn.`,
    `Always answer in ${lang}. Be specific, cite real numbers, avoid generalities.`,
  ];
  if (focus) lines.push(`User focus for this conversation: ${focus}`);
  return lines.join('\n');
}

/**
 * Instrução do pase final do chat: força saída JSON com a resposta conversacional
 * e, opcionalmente, specs de gráfico (generative UI). O LLM embute os DADOS no
 * próprio gráfico — o frontend não precisa re-casar com as queries.
 */
export function buildChatFinalPrompt(language: string): string {
  const isEn = language === 'en-US';
  const chartSpec =
    'Each chart: { "title": string, "type": "bar"|"line"|"area"|"pie", ' +
    '"data": array of objects (each object is one data point, e.g. {"mes":"Jan","vendas":1200}), ' +
    '"xKey": string (the category/label field name present in every data object), ' +
    '"series": array of { "key": string (a numeric field name in data), "label"?: string } }. ' +
    `At most ${CHART_LIMITS.MAX_CHARTS} charts, ${CHART_LIMITS.MAX_DATA_POINTS} data points each, ` +
    `${CHART_LIMITS.MAX_SERIES} series each. Only include charts when a visualization genuinely helps; ` +
    'omit "charts" (or use []) otherwise. Use ONLY real values you obtained from run_dax_query.';
  if (isEn) {
    return (
      'Now produce your reply as a JSON object with these keys: ' +
      '"reply" (string — your conversational answer to the user, in English; light markdown is fine), ' +
      '"charts" (optional array of chart specs). ' +
      chartSpec +
      ' Respond ONLY with the JSON object.'
    );
  }
  return (
    'Agora produza sua resposta como um objeto JSON com estas chaves: ' +
    '"reply" (string — sua resposta conversacional ao usuário, em português do Brasil; markdown leve é ok), ' +
    '"charts" (array opcional de specs de gráfico). ' +
    chartSpec +
    ' Responda APENAS com o objeto JSON.'
  );
}
