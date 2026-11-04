import { describe, it, expect, vi } from 'vitest';
import { assertLocalDevelopmentTarget, LocalDevTargetError } from './local-dev-account-guard.js';
import {
  assertLocalDevPassword,
  LocalDevAccountInputError,
  parseLocalDevAccountArgs,
} from './local-dev-account-input.js';
import { createLocalDevAccount, type LocalDevAccountDeps } from './create-local-dev-account.js';

const LOCAL = 'postgresql://dev@127.0.0.1:5432/voice_agent_dev';

describe('assertLocalDevelopmentTarget', () => {
  it('accepts loopback databases outside production', () => {
    expect(
      assertLocalDevelopmentTarget({
        nodeEnv: 'development',
        appEnv: undefined,
        databaseUrl: LOCAL,
      }),
    ).toBe('127.0.0.1');
    expect(
      assertLocalDevelopmentTarget({
        nodeEnv: undefined,
        appEnv: 'local',
        databaseUrl: 'postgresql://dev@localhost:5432/voice_agent_dev',
      }),
    ).toBe('localhost');
  });

  it('refuses production, staging and any non-loopback database without echoing the URL', () => {
    const remote = 'postgresql://user:s3cr3t@db.example.com:5432/app';
    const cases = [
      { nodeEnv: 'production', appEnv: undefined, databaseUrl: LOCAL },
      { nodeEnv: 'development', appEnv: 'staging', databaseUrl: LOCAL },
      { nodeEnv: 'development', appEnv: 'PRODUCTION', databaseUrl: LOCAL },
      { nodeEnv: 'development', appEnv: undefined, databaseUrl: remote },
      { nodeEnv: 'development', appEnv: undefined, databaseUrl: 'not-a-url' },
      { nodeEnv: 'development', appEnv: undefined, databaseUrl: undefined },
    ];
    for (const input of cases) {
      try {
        assertLocalDevelopmentTarget(input);
        expect.unreachable(`should refuse ${JSON.stringify(input.appEnv)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(LocalDevTargetError);
        expect((error as Error).message).not.toContain('s3cr3t');
        expect((error as Error).message).not.toContain('postgresql://');
      }
    }
  });
});

describe('parseLocalDevAccountArgs', () => {
  it('parses email, name and an optional organization pair', () => {
    expect(
      parseLocalDevAccountArgs([
        '--email',
        'Pessoa@Example.com',
        '--org-slug',
        'minha-org',
        '--org-name',
        'Minha Org',
      ]),
    ).toEqual({
      email: 'pessoa@example.com',
      name: 'Conta local de desenvolvimento',
      organization: { slug: 'minha-org', name: 'Minha Org' },
    });
  });

  it('refuses a password on the command line, unknown flags, invalid email and half an organization', () => {
    const invalid: string[][] = [
      ['--email', 'a@b.com', '--password', 'x'],
      ['--email', 'a@b.com', '--role', 'OWNER'],
      ['--email', 'sem-arroba'],
      ['--email', 'a@b.com', '--org-slug', 'org-a'],
      ['--email', 'a@b.com', '--org-slug', 'Org A!', '--org-name', 'X'],
      ['--email'],
    ];
    for (const argv of invalid) {
      expect(() => parseLocalDevAccountArgs(argv)).toThrow(LocalDevAccountInputError);
    }
  });

  it('requires passwords of at least 12 characters', () => {
    expect(() => assertLocalDevPassword('curta')).toThrow(LocalDevAccountInputError);
    expect(() => assertLocalDevPassword('suficientemente-longa')).not.toThrow();
  });
});

function deps(overrides: Partial<LocalDevAccountDeps> = {}): LocalDevAccountDeps {
  return {
    signUp: vi.fn(async () => ({ userId: 'usr-1' })),
    findOrganizationBySlug: vi.fn(async () => undefined),
    createOrganization: vi.fn(async () => ({ id: 'org-1' })),
    hasMembership: vi.fn(async () => false),
    createOwnerMembership: vi.fn(async () => undefined),
    ...overrides,
  };
}

const INPUT = {
  email: 'pessoa@example.com',
  name: 'Pessoa',
  password: 'senha-local-longa',
  organization: { slug: 'org-a', name: 'Org A' },
};

describe('createLocalDevAccount', () => {
  it('creates the account through sign-up and an OWNER membership in a new local organization', async () => {
    const d = deps();
    const result = await createLocalDevAccount(INPUT, d);
    expect(result).toEqual({
      kind: 'CREATED',
      email: INPUT.email,
      organization: { slug: 'org-a', created: true },
    });
    expect(d.signUp).toHaveBeenCalledWith({
      email: INPUT.email,
      password: INPUT.password,
      name: 'Pessoa',
    });
    expect(d.createOwnerMembership).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'usr-1',
    });
    expect(JSON.stringify(result)).not.toContain(INPUT.password);
  });

  it('reuses an existing organization and does not duplicate the membership', async () => {
    const d = deps({
      findOrganizationBySlug: vi.fn(async () => ({ id: 'org-9' })),
      hasMembership: vi.fn(async () => true),
    });
    const result = await createLocalDevAccount(INPUT, d);
    expect(result).toEqual({
      kind: 'CREATED',
      email: INPUT.email,
      organization: { slug: 'org-a', created: false },
    });
    expect(d.createOrganization).not.toHaveBeenCalled();
    expect(d.createOwnerMembership).not.toHaveBeenCalled();
  });

  it('never resets an existing account and touches no organization', async () => {
    const d = deps({
      signUp: vi.fn(async () => {
        throw Object.assign(new Error('exists'), {
          body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
        });
      }),
    });
    expect(await createLocalDevAccount(INPUT, d)).toEqual({
      kind: 'ALREADY_EXISTS',
      email: INPUT.email,
    });
    expect(d.findOrganizationBySlug).not.toHaveBeenCalled();
  });

  it('propagates other sign-up failures instead of reporting success', async () => {
    const d = deps({
      signUp: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    await expect(createLocalDevAccount(INPUT, d)).rejects.toThrow('db down');
  });
});
