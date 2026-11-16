/**
 * Endereço de escuta da API. Padrão: só loopback (`127.0.0.1`), para que a
 * homologação local nunca fique exposta na rede. Escutar em todas as
 * interfaces (`0.0.0.0`, `::`) exige `API_ALLOW_PUBLIC_BIND=true` explícito.
 */
export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = 3001;

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]', '*']);

export interface ApiListenOptions {
  readonly hostname: string;
  readonly port: number;
}

export class ApiListenConfigError extends Error {}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_API_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new ApiListenConfigError('PORT deve ser um inteiro entre 0 e 65535.');
  }
  return port;
}

export function resolveApiListenOptions(
  env: Readonly<Record<string, string | undefined>>,
): ApiListenOptions {
  const hostname = env['HOST']?.trim() || DEFAULT_API_HOST;
  if (WILDCARD_HOSTS.has(hostname) && env['API_ALLOW_PUBLIC_BIND'] !== 'true') {
    throw new ApiListenConfigError(
      `HOST=${hostname} escutaria em todas as interfaces; defina API_ALLOW_PUBLIC_BIND=true para permitir.`,
    );
  }
  return { hostname, port: parsePort(env['PORT']) };
}
