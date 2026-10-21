import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { isLocalDockerEndpoint, type TestTargetEvidence } from './test-database-target-evidence.js';

export type DockerCli = (args: readonly string[]) => Promise<string>;

/**
 * P0-A — prova de que o servidor PostgreSQL vê o MESMO sistema de arquivos
 * deste processo: grava um nonce aleatório no disco local e exige que o
 * servidor o leia com `pg_read_file`. Um túnel para servidor remoto (mesmo em
 * localhost/loopback) não enxerga o arquivo → UNAVAILABLE/MISMATCH → rejeição.
 */
export async function proveLocalFilesystem(
  db: DatabaseInstance,
): Promise<TestTargetEvidence['localFileProof']> {
  const nonce = randomUUID();
  const dir = process.platform === 'win32' ? tmpdir() : '/tmp';
  const path = join(dir, `voice-agent-test-target-${randomUUID()}.txt`);
  try {
    await writeFile(path, nonce, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    const result = await db.execute<{ content: string }>(
      sql`SELECT pg_read_file(${path}) AS content`,
    );
    return result.rows[0]?.content.trim() === nonce ? 'VERIFIED' : 'MISMATCH';
  } catch {
    return 'UNAVAILABLE';
  } finally {
    await rm(path, { force: true });
  }
}

/**
 * P0-B — endpoint do daemon Docker EFETIVAMENTE usado pela CLI: `DOCKER_HOST`
 * (que tem precedência) ou o contexto atual (`DOCKER_CONTEXT`/configuração),
 * lido com `docker context inspect`. Vazio/erro → '' (não local).
 */
export async function resolveDockerEndpoint(input: {
  readonly runner: DockerCli;
  readonly env: Readonly<Record<string, string | undefined>>;
}): Promise<string> {
  const fromEnv = input.env.DOCKER_HOST?.trim();
  if (fromEnv) return fromEnv;
  try {
    const out = await input.runner([
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ]);
    return out.trim();
  } catch {
    return '';
  }
}

/** Fixa o endpoint verificado em TODA chamada seguinte (`-H`), sem reler contexto. */
export function pinnedDockerRunner(runner: DockerCli, endpoint: string): DockerCli | null {
  if (!isLocalDockerEndpoint(endpoint)) return null;
  return (args) => runner(['-H', endpoint, ...args]);
}

/** Identidade do cluster (`pg_control_system`) vista pela conexão. */
export async function readSystemIdentifier(db: DatabaseInstance): Promise<string | null> {
  try {
    const result = await db.execute<{ sysid: string }>(
      sql`SELECT system_identifier::text AS sysid FROM pg_control_system()`,
    );
    return result.rows[0]?.sysid ?? null;
  } catch {
    return null;
  }
}
