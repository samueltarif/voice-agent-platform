/**
 * Guarda PURA (sem I/O) que decide se o destino PostgreSQL dos testes é um
 * servidor local e descartável comprovado. Fail-closed: endereço privado,
 * `localhost` ou variável de ambiente sozinhos NUNCA bastam.
 *
 * Modos aceitos:
 * - DIRECT_LOOPBACK: cliente em loopback E servidor enxerga a conexão em
 *   loopback (ou socket local).
 * - DOCKER_LOCAL_CONTAINER: cliente em loopback, servidor enxerga um IP de
 *   bridge (ex.: Docker Desktop/WSL2 via `wslrelay`), e o `docker inspect` do
 *   container AUTORIZADO prova: em execução, imagem postgres:16, serviço
 *   compose `postgres`, porta publicada SOMENTE em loopback e igual à porta
 *   usada pelo cliente, IP do container == IP visto pelo servidor, e o mesmo
 *   `system_identifier` do cluster lido dentro do container e pela conexão.
 */
export interface DockerPortBinding {
  readonly hostIp: string;
  readonly hostPort: number;
}

export type DockerEvidence =
  | { readonly kind: 'UNAVAILABLE' }
  | {
      readonly kind: 'INSPECTED';
      readonly authorizedName: string;
      readonly name: string;
      readonly running: boolean;
      readonly image: string;
      readonly composeService: string | null;
      readonly portBindings: readonly DockerPortBinding[];
      readonly containerAddresses: readonly string[];
      readonly systemIdentifier: string | null;
    };

export interface TestTargetEvidence {
  readonly clientHost: string;
  readonly clientPort: number;
  readonly serverAddress: string | null;
  readonly serverVersionNum: number;
  readonly systemIdentifier: string | null;
  readonly canCreateDatabase: boolean;
  readonly docker: DockerEvidence | null;
}

export type TestTargetRejection =
  | 'CLIENT_HOST_NOT_LOOPBACK'
  | 'SERVER_NOT_POSTGRES_16'
  | 'CANNOT_CREATE_DATABASE'
  | 'FORWARDED_TARGET_UNPROVEN'
  | 'CONTAINER_NOT_AUTHORIZED'
  | 'PUBLISHED_PORT_MISMATCH'
  | 'CONTAINER_ADDRESS_MISMATCH'
  | 'CLUSTER_IDENTITY_MISMATCH';

export type TestTargetDecision =
  | { readonly accepted: true; readonly mode: 'DIRECT_LOOPBACK' | 'DOCKER_LOCAL_CONTAINER' }
  | { readonly accepted: false; readonly reason: TestTargetRejection };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);
const DISPOSABLE_NAME = /^of2_test_[0-9a-f]{12}$/;
const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

export function isDisposableDatabaseName(name: string): boolean {
  return DISPOSABLE_NAME.test(name);
}

/** Nunca usa `DATABASE_URL`: só `TEST_DATABASE_URL` ou o padrão local do repositório. */
export function resolveTestAdminUrl(env: Readonly<Record<string, string | undefined>>): string {
  return env.TEST_DATABASE_URL || DEFAULT_ADMIN_URL;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

const reject = (reason: TestTargetRejection): TestTargetDecision => ({ accepted: false, reason });

function baselineRejection(evidence: TestTargetEvidence): TestTargetRejection | null {
  if (!isLoopbackHost(evidence.clientHost)) return 'CLIENT_HOST_NOT_LOOPBACK';
  const major = Math.floor(evidence.serverVersionNum / 10000);
  if (major !== 16) return 'SERVER_NOT_POSTGRES_16';
  return evidence.canCreateDatabase ? null : 'CANNOT_CREATE_DATABASE';
}

function containerIdentityRejection(
  docker: Extract<DockerEvidence, { kind: 'INSPECTED' }>,
): TestTargetRejection | null {
  const authorized =
    docker.name === docker.authorizedName &&
    docker.running &&
    /^postgres:16([.-]|$)/.test(docker.image) &&
    docker.composeService === 'postgres';
  return authorized ? null : 'CONTAINER_NOT_AUTHORIZED';
}

function containerCorrelationRejection(
  docker: Extract<DockerEvidence, { kind: 'INSPECTED' }>,
  evidence: TestTargetEvidence,
): TestTargetRejection | null {
  const loopbackOnly =
    docker.portBindings.length > 0 &&
    docker.portBindings.every((b) => LOOPBACK_ADDRESSES.has(b.hostIp));
  const portMatches = docker.portBindings.some((b) => b.hostPort === evidence.clientPort);
  if (!loopbackOnly || !portMatches) return 'PUBLISHED_PORT_MISMATCH';
  if (!docker.containerAddresses.includes(evidence.serverAddress ?? ''))
    return 'CONTAINER_ADDRESS_MISMATCH';
  const sameCluster =
    docker.systemIdentifier !== null && docker.systemIdentifier === evidence.systemIdentifier;
  return sameCluster ? null : 'CLUSTER_IDENTITY_MISMATCH';
}

export function evaluateTestTargetEvidence(evidence: TestTargetEvidence): TestTargetDecision {
  const baseline = baselineRejection(evidence);
  if (baseline) return reject(baseline);
  const address = evidence.serverAddress;
  if (address === null || LOOPBACK_ADDRESSES.has(address)) {
    return { accepted: true, mode: 'DIRECT_LOOPBACK' };
  }
  const docker = evidence.docker;
  if (!docker || docker.kind !== 'INSPECTED') return reject('FORWARDED_TARGET_UNPROVEN');
  const problem =
    containerIdentityRejection(docker) ?? containerCorrelationRejection(docker, evidence);
  return problem ? reject(problem) : { accepted: true, mode: 'DOCKER_LOCAL_CONTAINER' };
}
