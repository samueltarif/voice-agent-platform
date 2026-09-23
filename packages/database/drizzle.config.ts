import { defineConfig } from 'drizzle-kit';

const isStaging = process.env.APP_ENV === 'staging';
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (isStaging && (!migrationUrl || migrationUrl.trim() === '')) {
  throw new Error(
    'MIGRATION_DATABASE_URL is required when APP_ENV=staging. Fallback to DATABASE_URL is prohibited.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: {
    url:
      migrationUrl ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/voice_agent_dev',
  },
  strict: true,
  verbose: true,
});
