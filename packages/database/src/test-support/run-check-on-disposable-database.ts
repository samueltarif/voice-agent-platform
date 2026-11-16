import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDatabaseConnection } from '../client/connection.js';
import { runMigrations } from '../client/migrate.js';
import { collectTestDatabaseEvidence } from './collect-test-database-evidence.js';
import {
  evaluateTestTargetEvidence,
  resolveTestAdminUrl,
} from './test-database-target-evidence.js';

/**
 * Gate em banco DESCARTÁVEL (DEC-062): cria `of2_test_<hex>` num PostgreSQL
 * local COMPROVADO, aplica as migrations existentes SÓ nele, roda o comando
 * (padrão `pnpm check`) com `TEST_DATABASE_URL` apontando para ele e o remove
 * no fim. Nenhum banco preexistente recebe DDL ou dados de teste; a conexão
 * administrativa (`TEST_DATABASE_URL`, recomendado `.../postgres`) só executa
 * `CREATE DATABASE`/`DROP DATABASE`. Nenhuma connection string é impressa.
 */
const adminUrl = resolveTestAdminUrl(process.env);
const command = process.argv.slice(2);
const name = `of2_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const log = (message: string) => console.log(`[gate-disposable] ${message}`);

async function withAdmin<T>(
  work: (db: ReturnType<typeof createDatabaseConnection>['db']) => Promise<T>,
) {
  const admin = createDatabaseConnection({ connectionString: adminUrl, maxConnections: 1 });
  try {
    return await work(admin.db);
  } finally {
    await admin.pool.end();
  }
}

async function createGateDatabase(): Promise<string> {
  await withAdmin(async (db) => {
    const decision = evaluateTestTargetEvidence(
      await collectTestDatabaseEvidence({ adminUrl, db }),
    );
    if (!decision.accepted) {
      throw new Error(`Refusing unproven PostgreSQL target (${decision.reason}); nothing created.`);
    }
    log(`destino local comprovado (${decision.mode}); criando ${name}`);
    await db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  });
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  await runMigrations({ connectionString: url.toString() });
  log(`migrations existentes aplicadas em ${name}`);
  return url.toString();
}

async function dropGateDatabase(): Promise<void> {
  await withAdmin(async (db) => {
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    const left = await db.execute(sql`SELECT 1 FROM pg_database WHERE datname = ${name}`);
    if (left.rows.length > 0) throw new Error(`${name} still present after drop.`);
  });
  log(`${name} removido`);
}

function runCommand(gateUrl: string): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env, TEST_DATABASE_URL: gateUrl };
  delete env['DATABASE_URL'];
  delete env['MIGRATION_DATABASE_URL'];
  const [bin, ...args] = command.length > 0 ? command : ['pnpm', 'check'];
  log(`executando: ${[bin, ...args].join(' ')}`);
  const child = spawn(bin!, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}

let exitCode = 1;
let created = false;
try {
  const gateUrl = await createGateDatabase();
  created = true;
  exitCode = await runCommand(gateUrl);
  log(`comando terminou com exit ${exitCode}`);
} catch (error) {
  console.error(`[gate-disposable] ERRO: ${error instanceof Error ? error.message : 'falha'}`);
} finally {
  if (created) await dropGateDatabase().catch(() => (exitCode = 1));
}
process.exit(exitCode);
