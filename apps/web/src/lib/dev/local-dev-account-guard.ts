/**
 * Barreira do comando de conta local de desenvolvimento: só roda contra um
 * PostgreSQL em loopback e fora de produção/staging. Nunca devolve nem imprime
 * a string de conexão (apenas o host).
 */

export interface LocalDevTargetInput {
  readonly nodeEnv: string | undefined;
  readonly appEnv: string | undefined;
  readonly databaseUrl: string | undefined;
}

const LOOPBACK_DB_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const FORBIDDEN_APP_ENVS = new Set(['staging', 'production', 'prod']);

export class LocalDevTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDevTargetError';
  }
}

function databaseHost(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new LocalDevTargetError('Defina DATABASE_URL apontando para o PostgreSQL local.');
  }
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new LocalDevTargetError('DATABASE_URL inválida: não foi possível identificar o host.');
  }
}

/** Retorna o host do banco quando o alvo é seguro; senão lança erro. */
export function assertLocalDevelopmentTarget(input: LocalDevTargetInput): string {
  if (input.nodeEnv === 'production') {
    throw new LocalDevTargetError('Recusado: NODE_ENV=production.');
  }
  if (input.appEnv && FORBIDDEN_APP_ENVS.has(input.appEnv.toLowerCase())) {
    throw new LocalDevTargetError(`Recusado: APP_ENV=${input.appEnv}.`);
  }
  const host = databaseHost(input.databaseUrl);
  if (!LOOPBACK_DB_HOSTS.has(host)) {
    throw new LocalDevTargetError(
      'Recusado: o banco não está em localhost. Este comando é exclusivo de desenvolvimento local.',
    );
  }
  return host;
}
