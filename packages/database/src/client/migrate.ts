import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDatabaseConnection } from './connection.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDir, '../migrations');

export interface RunMigrationsOptions {
  connectionString?: string | undefined;
}

export async function runMigrations(options: RunMigrationsOptions = {}): Promise<void> {
  const { db, pool } = createDatabaseConnection({
    connectionString: options.connectionString,
    maxConnections: 1,
  });

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  await runMigrations();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  });
}
