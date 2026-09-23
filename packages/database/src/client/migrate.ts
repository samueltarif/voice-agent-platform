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
  const isStaging = process.env.APP_ENV === 'staging';
  let connectionString = options.connectionString || process.env.MIGRATION_DATABASE_URL;

  if (isStaging) {
    if (!connectionString || connectionString.trim() === '') {
      throw new Error(
        'MIGRATION_DATABASE_URL is required when APP_ENV=staging. Fallback to DATABASE_URL is prohibited.',
      );
    }
  } else {
    connectionString = connectionString || process.env.DATABASE_URL;
  }

  const { db, pool } = createDatabaseConnection({
    connectionString,
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
