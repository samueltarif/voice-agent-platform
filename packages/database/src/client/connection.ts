import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../schema/index.js';

const { Pool } = pg;

export type DatabaseInstance = NodePgDatabase<typeof schema>;

export interface DatabaseConnectionOptions {
  connectionString?: string | undefined;
  maxConnections?: number | undefined;
}

export interface DatabaseClientResult {
  db: DatabaseInstance;
  pool: pg.Pool;
}

export function createDatabaseConnection(
  options: DatabaseConnectionOptions = {},
): DatabaseClientResult {
  const connectionString = options.connectionString || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not configured. Ensure database environment variables are set before connecting.',
    );
  }

  const pool = new Pool({
    connectionString,
    max: options.maxConnections ?? 10,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}
