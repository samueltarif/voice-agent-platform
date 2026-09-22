import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/voice_agent_dev',
  },
  strict: true,
  verbose: true,
});
