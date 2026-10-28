import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../client/connection.js';
import {
  AUTHORIZED_TEST_CONTAINER,
  collectTestDatabaseEvidence,
} from './collect-test-database-evidence.js';
import {
  acquireDisposableDatabaseLease,
  DISPOSABLE_DATABASE_LEASE_KEYS,
  releaseDisposableDatabaseLease,
} from './disposable-database-lease.js';
import {
  assertDroppableByThisRun,
  createDisposableTestDatabase,
} from './disposable-test-database.js';
import { proveLocalFilesystem } from './local-target-provenance.js';
import {
  evaluateTestTargetEvidence,
  isLoopbackHost,
  resolveTestAdminUrl,
  type TestTargetEvidence,
} from './test-database-target-evidence.js';

/**
 * Integração REAL com o PostgreSQL local de testes. Dois modos são legítimos:
 * DIRECT_LOOPBACK (o servidor vê a conexão em loopback e lê um nonce do disco
 * local) e DOCKER_LOCAL_CONTAINER (Docker Desktop/WSL2: o servidor vê o IP de
 * bridge e a prova vem do container autorizado). Timeout ampliado: evidência +
 * CREATE DATABASE + migrations excedem os 5 s padrão do Vitest neste host.
 */
const DDL_TIMEOUT_MS = 30_000;

/**
 * Esta suíte cria bancos DENTRO dos testes; o lease entre processos é obtido no
 * carregamento (sem limite de hook) para que a espera por outras suítes
 * descartáveis nunca consuma o `DDL_TIMEOUT_MS` dos testes. Criações internas
 * reentram no mesmo lease deste processo.
 */
await acquireDisposableDatabaseLease(resolveTestAdminUrl(process.env));

describe('disposable test database guard against the real local PostgreSQL', () => {
  const adminUrl = resolveTestAdminUrl(process.env);
  const admin = createDatabaseConnection({ connectionString: adminUrl, maxConnections: 1 });

  afterAll(async () => {
    await admin.pool.end();
    await releaseDisposableDatabaseLease();
  });

  async function leaseFreeForAnotherSession(): Promise<boolean> {
    const other = createDatabaseConnection({ connectionString: adminUrl, maxConnections: 1 });
    try {
      const keys = sql.join(
        DISPOSABLE_DATABASE_LEASE_KEYS.map((k) => sql`${k}`),
        sql`, `,
      );
      const taken = await other.db.execute(sql`SELECT pg_try_advisory_lock(${keys}) AS ok`);
      const ok = (taken.rows[0] as { ok: boolean }).ok;
      if (ok) await other.db.execute(sql`SELECT pg_advisory_unlock(${keys})`);
      return ok;
    } finally {
      await other.pool.end();
    }
  }

  it('L1. the disposable-database lease excludes other sessions while held', async () => {
    expect(await leaseFreeForAnotherSession()).toBe(false);
  });

  it(
    'L2. nested create/drop in the same process re-enters the lease and keeps it held',
    async () => {
      const tdb = await createDisposableTestDatabase('guard');
      await tdb.drop();
      expect(await leaseFreeForAnotherSession()).toBe(false);
    },
    DDL_TIMEOUT_MS,
  );

  async function databaseExists(name: string): Promise<boolean> {
    const result = await admin.db.execute(sql`SELECT 1 FROM pg_database WHERE datname = ${name}`);
    return result.rows.length > 0;
  }

  function nextDisposableName(): string {
    return `of2_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  async function acceptedEvidence(): Promise<{
    readonly evidence: TestTargetEvidence;
    readonly mode: 'DIRECT_LOOPBACK' | 'DOCKER_LOCAL_CONTAINER';
  }> {
    const evidence = await collectTestDatabaseEvidence({ adminUrl, db: admin.db });
    const decision = evaluateTestTargetEvidence(evidence);
    if (!decision.accepted) throw new Error(`test target rejected: ${decision.reason}`);
    return { evidence, mode: decision.mode };
  }

  it('collects real server evidence and accepts this local target with a recorded mode', async () => {
    const { evidence, mode } = await acceptedEvidence();
    expect(evidence.serverVersionNum).toBeGreaterThanOrEqual(160000);
    expect(evidence.canCreateDatabase).toBe(true);
    expect(isLoopbackHost(evidence.clientHost)).toBe(true);
    if (mode === 'DIRECT_LOOPBACK') {
      expect(evidence.localFileProof).toBe('VERIFIED');
      expect(evidence.docker).toBeNull();
      return;
    }
    expect(evidence.localFileProof).toBe('UNAVAILABLE');
    const docker = evidence.docker;
    expect(docker?.kind).toBe('INSPECTED');
    if (!docker || docker.kind !== 'INSPECTED') {
      throw new Error('Docker-local mode accepted without inspected container evidence.');
    }
    expect(docker.name).toBe(AUTHORIZED_TEST_CONTAINER);
    expect(docker.running).toBe(true);
    expect(docker.image).toMatch(/^postgres:16([.-]|$)/);
    expect(docker.composeService).toBe('postgres');
    expect(docker.portBindings).toContainEqual({
      hostIp: '127.0.0.1',
      hostPort: evidence.clientPort,
    });
    expect(docker.containerAddresses).toContain(evidence.serverAddress);
    expect(docker.systemIdentifier).not.toBeNull();
    expect(docker.systemIdentifier).toBe(evidence.systemIdentifier);
  });

  it('P0-A. the local-filesystem proof is a real round trip through the server', async () => {
    const { evidence, mode } = await acceptedEvidence();
    const proof = await proveLocalFilesystem(admin.db);
    expect(proof).toBe(evidence.localFileProof);
    if (mode === 'DIRECT_LOOPBACK') {
      expect(proof).toBe('VERIFIED');
      return;
    }
    // Docker Desktop/WSL2: o servidor está no container e NÃO vê o arquivo do
    // host; a aceitação vem da identidade do container, não desta prova.
    expect(proof).toBe('UNAVAILABLE');
    expect(evidence.docker?.kind).toBe('INSPECTED');
  });

  it(
    'P1. a migration failure after CREATE DATABASE leaves no orphan and keeps the original cause',
    async () => {
      const name = nextDisposableName();
      const original = new Error('induced migration failure');
      await expect(
        createDisposableTestDatabase('guard', {
          databaseName: name,
          runMigrationsFn: () => Promise.reject(original),
        }),
      ).rejects.toBe(original);
      expect(await databaseExists(name)).toBe(false);
      expect(() => assertDroppableByThisRun(name)).toThrow();
    },
    DDL_TIMEOUT_MS,
  );

  it('10. a failed verification executes zero DDL (no database is created)', async () => {
    const name = nextDisposableName();
    const forged = async () => ({
      clientHost: 'localhost',
      clientPort: 5432,
      serverAddress: '172.18.0.2',
      serverVersionNum: 160015,
      systemIdentifier: '1',
      canCreateDatabase: true,
      localFileProof: 'UNAVAILABLE' as const,
      docker: { kind: 'UNAVAILABLE' as const },
    });
    await expect(
      createDisposableTestDatabase('guard', { databaseName: name, collectEvidence: forged }),
    ).rejects.toThrow(/FORWARDED_TARGET_UNPROVEN.*no DDL executed/);
    expect(await databaseExists(name)).toBe(false);
  });

  it('refuses an injected database name that is not disposable, before any DDL', async () => {
    await expect(
      createDisposableTestDatabase('guard', { databaseName: 'voice_agent_dev' }),
    ).rejects.toThrow(/not disposable/);
  });

  it(
    '11. cleanup only touches the disposable database created by this run',
    async () => {
      expect(() => assertDroppableByThisRun('voice_agent_dev')).toThrow();
      expect(() => assertDroppableByThisRun('postgres')).toThrow();
      expect(() => assertDroppableByThisRun('of2_test_0123456789ab')).toThrow();
      const tdb = await createDisposableTestDatabase('guard');
      try {
        expect(await databaseExists(tdb.name)).toBe(true);
        expect(() => assertDroppableByThisRun(tdb.name)).not.toThrow();
      } finally {
        await tdb.drop();
      }
      expect(await databaseExists(tdb.name)).toBe(false);
      expect(() => assertDroppableByThisRun(tdb.name)).toThrow();
    },
    DDL_TIMEOUT_MS,
  );
});
