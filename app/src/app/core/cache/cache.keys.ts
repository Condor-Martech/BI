/**
 * Convenção de chaves e TTLs do cache Redis.
 *
 * Formato das chaves: `namespace:scope:id`. Toda chave começa por um dos
 * prefixos de CACHE_NS — assim a invalidação por prefixo
 * (CacheService.delByPrefix) apaga um namespace inteiro de uma vez.
 *
 * TTLs em milissegundos: o cache-manager v5 trabalha em ms.
 */

export const CACHE_TTL = {
  ONE_HOUR: 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
} as const;

/** Prefixos de namespace. Usados como alvo de delByPrefix. */
export const CACHE_NS = {
  GROUPS: 'groups:',
  REPORTS: 'reports:',
  FILTERS: 'filters:',
} as const;

/** Builders de chave — único lugar que conhece o formato das chaves. */
export const CacheKeys = {
  /** GET /groups/report/:groupIdPB */
  groupReports: (groupIdPB: string): string => `${CACHE_NS.GROUPS}report:${groupIdPB}`,
  /** GET /reports/all — chave distinta por includeHidden pra não misturar listagens. */
  reportsAll: (includeHidden = false): string =>
    `${CACHE_NS.REPORTS}all${includeHidden ? ':withHidden' : ''}`,
  /** GET /filters/tabelas/:id */
  filterTables: (datasetId: string): string => `${CACHE_NS.FILTERS}tables:${datasetId}`,
  /** GET /filters/get/datasets */
  filterDatasets: (): string => `${CACHE_NS.FILTERS}datasets:all`,
};
