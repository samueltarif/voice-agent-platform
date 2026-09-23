import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  createDatabaseConnection,
  user,
  session,
  account,
  verification,
} from '@voice-agent/database';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

const { db } = createDatabaseConnection({
  connectionString,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret:
    process.env.BETTER_AUTH_SECRET || 'development-insecure-secret-minimum-32-characters-required!',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
});
