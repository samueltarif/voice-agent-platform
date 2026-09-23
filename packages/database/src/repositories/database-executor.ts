import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../schema/index.js';

export type DatabaseExecutor =
  | Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0]
  | NodePgDatabase<typeof schema>;
