/**
 * Comando de desenvolvimento: `pnpm --filter @voice-agent/web dev:create-local-account
 *   --email voce@exemplo.com [--name "Seu nome"] [--org-slug minha-org --org-name "Minha Org"]`
 *
 * - Só roda contra PostgreSQL em localhost e fora de produção/staging.
 * - Senha: prompt oculto (digitada duas vezes) ou `LOCAL_DEV_ACCOUNT_PASSWORD`;
 *   nunca pela linha de comando, nunca impressa, nunca gravada em arquivo.
 * - A conta é criada pelo Better Auth (mesmo hash de senha do login real).
 */
import {
  createDatabaseConnection,
  MembershipRepository,
  OrganizationRepository,
} from '@voice-agent/database';
import { auth } from '../auth/auth';
import { assertLocalDevelopmentTarget, LocalDevTargetError } from './local-dev-account-guard';
import {
  assertLocalDevPassword,
  LocalDevAccountInputError,
  parseLocalDevAccountArgs,
} from './local-dev-account-input';
import { createLocalDevAccount, type LocalDevAccountDeps } from './create-local-dev-account';
import { readHiddenLine } from './read-hidden-line';

async function readPassword(): Promise<string> {
  const fromEnv = process.env.LOCAL_DEV_ACCOUNT_PASSWORD;
  if (fromEnv) return fromEnv;
  try {
    const first = await readHiddenLine('Senha da conta local: ');
    const second = await readHiddenLine('Repita a senha: ');
    if (first !== second) throw new Error('As senhas não conferem.');
    return first;
  } catch (error) {
    // Mensagens do prompt são seguras (sem dados); repassadas ao usuário.
    throw new LocalDevAccountInputError(error instanceof Error ? error.message : 'Cancelado.');
  }
}

function buildDeps(): LocalDevAccountDeps {
  // Mesmo padrão de conexão da API: DATABASE_URL ou o banco local padrão do pacote.
  const { db } = createDatabaseConnection();
  const organizations = new OrganizationRepository(db);
  const memberships = new MembershipRepository(db);
  return {
    signUp: async (input) => {
      const result = await auth.api.signUpEmail({ body: input });
      return { userId: result.user.id };
    },
    findOrganizationBySlug: async (slug) =>
      (await organizations.findOrganizationBySlug({ slug })) ?? undefined,
    createOrganization: async (input) => {
      const created = await organizations.createOrganization({ ...input, status: 'ACTIVE' });
      if (!created) throw new Error('Falha ao criar a organização local.');
      return created;
    },
    hasMembership: async (input) => Boolean(await memberships.findMembership(input)),
    createOwnerMembership: async (input) => {
      await memberships.createMembership({ ...input, role: 'OWNER', status: 'ACTIVE' });
    },
  };
}

/** Erros esperados mostram a mensagem; os demais, só tipo e código (sem SQL nem parâmetros). */
function describeFailure(error: unknown): string {
  if (error instanceof LocalDevTargetError || error instanceof LocalDevAccountInputError) {
    return error.message;
  }
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  const name = error instanceof Error ? error.name : 'Error';
  return `Falha ao criar a conta local (${name}${typeof code === 'string' ? `, código ${code}` : ''}).`;
}

async function main(): Promise<number> {
  const host = assertLocalDevelopmentTarget({
    nodeEnv: process.env.NODE_ENV,
    appEnv: process.env.APP_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  const input = parseLocalDevAccountArgs(process.argv.slice(2));
  const password = await readPassword();
  assertLocalDevPassword(password);
  const result = await createLocalDevAccount({ ...input, password }, buildDeps());
  if (result.kind === 'ALREADY_EXISTS') {
    console.error(
      `A conta ${result.email} já existe neste banco local (${host}). Nada foi alterado.`,
    );
    return 2;
  }
  console.log(`Conta local criada: ${result.email} (banco em ${host}).`);
  if (result.organization) {
    const how = result.organization.created ? 'criada' : 'existente';
    console.log(`Organização ${how}: ${result.organization.slug} (papel OWNER).`);
  }
  console.log('Entre em /login com esse e-mail e a senha que você digitou.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(describeFailure(error));
    process.exit(1);
  },
);
