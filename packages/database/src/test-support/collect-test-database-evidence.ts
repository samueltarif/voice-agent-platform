import { execFile } from 'node:child_process';
import { sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import {
  pinnedDockerRunner,
  proveLocalFilesystem,
  readSystemIdentifier,
  resolveDockerEndpoint,
} from './local-target-provenance.js';
import {
  isLocalDockerEndpoint,
  type DockerEvidence,
  type DockerPortBinding,
  type TestTargetEvidence,
} from './test-database-target-evidence.js';

/** Executa o Docker CLI (APENAS no harness de testes). */
export type DockerRunner = (args: readonly string[]) => Promise<string>;

export const AUTHORIZED_TEST_CONTAINER =
  process.env.VOICE_AGENT_TEST_PG_CONTAINER || 'voice-agent-postgres';

export const runDockerCli: DockerRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('docker', [...args], { timeout: 15_000, windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    );
  });

interface InspectRecord {
  readonly Name?: string;
  readonly State?: { readonly Running?: boolean };
  readonly Config?: { readonly Image?: string; readonly Labels?: Record<string, string> | null };
  readonly NetworkSettings?: {
    readonly Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null> | null;
    readonly Networks?: Record<string, { IPAddress?: string; GlobalIPv6Address?: string }> | null;
  };
}

function bindingsOf(record: InspectRecord): DockerPortBinding[] {
  const raw = record.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  return (raw ?? []).map((b) => ({ hostIp: b.HostIp ?? '', hostPort: Number(b.HostPort ?? NaN) }));
}

function addressesOf(record: InspectRecord): string[] {
  const networks = Object.values(record.NetworkSettings?.Networks ?? {});
  return networks
    .flatMap((n) => [n.IPAddress, n.GlobalIPv6Address])
    .filter((a): a is string => Boolean(a));
}

/** Converte a saída de `docker inspect` (JSON) em evidência; qualquer desvio → UNAVAILABLE. */
interface InspectContext {
  readonly endpoint: string;
  readonly authorizedName: string;
  readonly systemIdentifier: string | null;
}

function toEvidence(record: InspectRecord, input: InspectContext): DockerEvidence {
  const config = record.Config ?? {};
  return {
    kind: 'INSPECTED',
    endpoint: input.endpoint,
    authorizedName: input.authorizedName,
    name: (record.Name ?? '').replace(/^\//, ''),
    running: record.State?.Running === true,
    image: config.Image ?? '',
    composeService: config.Labels?.['com.docker.compose.service'] ?? null,
    portBindings: bindingsOf(record),
    containerAddresses: addressesOf(record),
    systemIdentifier: input.systemIdentifier,
  };
}

/** Converte a saída de `docker inspect` (JSON) em evidência; qualquer desvio → UNAVAILABLE. */
export function parseDockerInspect(json: string, input: InspectContext): DockerEvidence {
  try {
    const [record] = JSON.parse(json) as InspectRecord[];
    return record ? toEvidence(record, input) : { kind: 'UNAVAILABLE' };
  } catch {
    return { kind: 'UNAVAILABLE' };
  }
}

export async function collectDockerEvidence(input: {
  readonly runner: DockerRunner;
  readonly authorizedName: string;
  readonly user: string;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}): Promise<DockerEvidence> {
  try {
    const endpoint = await resolveDockerEndpoint({
      runner: input.runner,
      env: input.env ?? process.env,
    });
    const pinned = isLocalDockerEndpoint(endpoint)
      ? pinnedDockerRunner(input.runner, endpoint)
      : null;
    if (!pinned) return { kind: 'UNAVAILABLE' };
    const inspect = await pinned(['inspect', input.authorizedName]);
    const sysid = await pinned([
      'exec',
      input.authorizedName,
      'psql',
      '-U',
      input.user,
      '-d',
      'postgres',
      '-tAc',
      'SELECT system_identifier FROM pg_control_system()',
    ]);
    const systemIdentifier = sysid.trim() || null;
    return parseDockerInspect(inspect, {
      endpoint,
      authorizedName: input.authorizedName,
      systemIdentifier,
    });
  } catch {
    return { kind: 'UNAVAILABLE' };
  }
}

interface ServerFacts {
  readonly serverAddress: string | null;
  readonly serverVersionNum: number;
  readonly canCreateDatabase: boolean;
}

async function readServerFacts(db: DatabaseInstance): Promise<ServerFacts> {
  const result = await db.execute<{ addr: string | null; ver: number; can_create: boolean }>(sql`
    SELECT host(inet_server_addr()) AS addr,
           current_setting('server_version_num')::int AS ver,
           (SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname = current_user) AS can_create`);
  const row = result.rows[0];
  return {
    serverAddress: row?.addr ?? null,
    serverVersionNum: Number(row?.ver ?? 0),
    canCreateDatabase: row?.can_create === true,
  };
}

function isLoopbackServer(address: string | null): boolean {
  return address === null || address === '127.0.0.1' || address === '::1';
}

/** Coleta evidências do servidor (via conexão) e, só se necessário, do Docker. */
export async function collectTestDatabaseEvidence(input: {
  readonly adminUrl: string;
  readonly db: DatabaseInstance;
  readonly runner?: DockerRunner | undefined;
}): Promise<TestTargetEvidence> {
  const url = new URL(input.adminUrl);
  const facts = await readServerFacts(input.db);
  const loopback = isLoopbackServer(facts.serverAddress);
  const docker = loopback
    ? null
    : await collectDockerEvidence({
        runner: input.runner ?? runDockerCli,
        authorizedName: AUTHORIZED_TEST_CONTAINER,
        user: decodeURIComponent(url.username) || 'postgres',
      });
  return {
    ...facts,
    clientHost: url.hostname,
    clientPort: Number(url.port) || 5432,
    systemIdentifier: await readSystemIdentifier(input.db),
    localFileProof: loopback ? await proveLocalFilesystem(input.db) : 'UNAVAILABLE',
    docker,
  };
}
