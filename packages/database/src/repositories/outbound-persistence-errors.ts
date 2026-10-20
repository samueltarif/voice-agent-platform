import { findDriverError } from './postgres-driver-error.js';

export type PostgresFailureKind =
  | 'UNIQUE_VIOLATION'
  | 'FOREIGN_KEY_VIOLATION'
  | 'CHECK_VIOLATION'
  | 'INVARIANT_GUARD'
  | 'SERIALIZATION_CONFLICT'
  | 'TECHNICAL';

export interface PostgresFailure {
  readonly kind: PostgresFailureKind;
  readonly constraint: string | null;
}

const KIND_BY_SQLSTATE: Readonly<Record<string, PostgresFailureKind>> = {
  '23505': 'UNIQUE_VIOLATION',
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23514': 'CHECK_VIOLATION',
  P0001: 'INVARIANT_GUARD',
  '40001': 'SERIALIZATION_CONFLICT',
  '40P01': 'SERIALIZATION_CONFLICT',
};

/**
 * Classifica falhas do PostgreSQL sem transformar toda violação em
 * "duplicata": cada chamador decide o significado de negócio. Falhas de
 * conexão e demais erros ficam como TECHNICAL e devem ser propagadas.
 */
export function classifyPostgresFailure(error: unknown): PostgresFailure {
  const driver = findDriverError(error, 5);
  const code = typeof driver?.code === 'string' ? driver.code : '';
  const constraint = typeof driver?.constraint === 'string' ? driver.constraint : null;
  return { kind: KIND_BY_SQLSTATE[code] ?? 'TECHNICAL', constraint };
}

/** Erro técnico sem dados de tenant, SQL ou parâmetros na mensagem. */
export class OutboundPersistenceTechnicalError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Outbound persistence operation '${operation}' failed technically.`, options);
    this.name = 'OutboundPersistenceTechnicalError';
  }
}
