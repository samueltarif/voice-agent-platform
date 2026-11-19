import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { user, type createDatabaseConnection } from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  type DisposableTestDatabase,
} from '@voice-agent/database/test-support';

/**
 * Integração REAL com PostgreSQL, em banco DESCARTÁVEL (`of2_test_<hex>`),
 * criado e migrado pelo mecanismo do projeto e removido ao final.
 *
 * Antes, `auth.ts` caía no banco local fixo `voice_agent_dev` sempre que
 * `DATABASE_URL` não existia (o gate descartável remove essa variável): o
 * teste gravava usuários num banco persistente e falhava quando ele não
 * estava migrado. Agora `DATABASE_URL` aponta para o descartável ANTES de
 * importar `auth.ts`, e o teste confere esse destino.
 */
/**
 * Captura (sem alterar) as conexões que `auth.ts` abre, para fechá-las ANTES
 * de remover o banco descartável: senão o término forçado das sessões
 * (57P01) vira erro não tratado no pool.
 */
const opened = vi.hoisted(() => [] as Array<ReturnType<typeof createDatabaseConnection>>);
vi.mock('@voice-agent/database', async (original) => {
  const actual = await original<typeof import('@voice-agent/database')>();
  return {
    ...actual,
    createDatabaseConnection: (...args: Parameters<typeof actual.createDatabaseConnection>) => {
      const connection = actual.createDatabaseConnection(...args);
      opened.push(connection);
      return connection;
    },
  };
});

let tdb: DisposableTestDatabase;
let auth: (typeof import('./auth.js'))['auth'];

beforeAll(async () => {
  tdb = await createDisposableTestDatabase('web-auth');
  vi.stubEnv('DATABASE_URL', tdb.url);
  ({ auth } = await import('./auth.js'));
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.all(opened.map((connection) => connection.pool.end()));
  await tdb?.drop();
}, 60_000);

describe('Better Auth Server Flow (Integration)', () => {
  it('uses only the disposable database, never the fixed local voice_agent_dev', () => {
    expect(tdb.name).toMatch(/^of2_test_[0-9a-f]{12}$/);
    expect(process.env.DATABASE_URL).toBe(tdb.url);
    expect(new URL(tdb.url).pathname).toBe(`/${tdb.name}`);
    // auth.ts abriu exatamente uma conexão, e ela aponta para o descartável.
    expect(opened.map((c) => c.pool.options.connectionString)).toEqual([tdb.url]);
  });

  it('initializes Better Auth instance with correct context and options', () => {
    expect(auth).toBeDefined();
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect('plugins' in auth.options).toBe(false);
  });

  it('registers new user, verifies credential persistence, and authenticates via signInEmail', async () => {
    const testSuffix = Math.random().toString(36).substring(2, 8);
    const email = `testuser_${testSuffix}@example.com`;
    const password = 'Password123!Secure';
    const name = `Test User ${testSuffix}`;

    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    expect(signUpResponse).toBeDefined();
    expect(signUpResponse.user).toBeDefined();
    expect(signUpResponse.user.email).toBe(email);
    expect(signUpResponse.user.name).toBe(name);
    expect(signUpResponse.token).toBeDefined();

    // A credencial foi persistida NO BANCO DESCARTÁVEL (não em outro destino).
    const rows = await tdb.db.select({ id: user.id, email: user.email }).from(user);
    expect(rows.filter((r) => r.email === email)).toEqual([{ id: signUpResponse.user.id, email }]);

    // Verify authentication and session issuance against persisted credentials in PostgreSQL
    const signInResponse = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    expect(signInResponse).toBeDefined();
    expect(signInResponse.user).toBeDefined();
    expect(signInResponse.user.id).toBe(signUpResponse.user.id);
    expect(signInResponse.user.email).toBe(email);
    expect(signInResponse.token).toBeDefined();
  });
});
