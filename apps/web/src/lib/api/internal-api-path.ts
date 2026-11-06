/**
 * F1 (DEC-051) — montagem segura de caminhos da API interna a partir de valores
 * não confiáveis (segmentos de URL decodificados pelo Next, query string).
 *
 * - Cada valor interpolado vira UM segmento: recusa vazio, `.`/`..`, `/`, `\`,
 *   `%` (dupla codificação), `?`, `#`, espaços e caracteres de controle, e é
 *   codificado com `encodeURIComponent`.
 * - IDs que o contrato define como UUID passam antes por `uuidRouteSegment`.
 * - A recusa tem o formato de um 404 da API (`status` 404, código `NOT_FOUND`),
 *   para os tratadores de erro existentes responderem "não encontrado" sem
 *   chamar a API e sem revelar nada.
 */
export class UnsafeInternalApiPathError extends Error {
  readonly status = 404;
  readonly data = { error: { code: 'NOT_FOUND', message: 'Resource not found' } } as const;

  constructor() {
    super('Resource not found');
    this.name = 'UnsafeInternalApiPathError';
  }
}

/** Mesmo padrão de `z.string().uuid()` (Zod 3), usado pelas rotas da API. */
const CONTRACT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line no-control-regex
const FORBIDDEN_SEGMENT_CHARS = /[/\\%?#\s\u0000-\u001f\u007f]/;

export function isContractUuid(value: unknown): value is string {
  return typeof value === 'string' && CONTRACT_UUID.test(value);
}

/** Valida um id de rota que o contrato define como UUID. */
export function uuidRouteSegment(value: unknown): string {
  if (!isContractUuid(value)) throw new UnsafeInternalApiPathError();
  return value;
}

export function encodeInternalPathSegment(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value === '.' || value === '..') {
    throw new UnsafeInternalApiPathError();
  }
  if (FORBIDDEN_SEGMENT_CHARS.test(value)) throw new UnsafeInternalApiPathError();
  return encodeURIComponent(value);
}

/** Template marcado: cada valor interpolado é um segmento seguro e codificado. */
export function internalApiPath(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce(
    (path, literal, index) =>
      index < values.length
        ? path + literal + encodeInternalPathSegment(values[index])
        : path + literal,
    '',
  );
}
