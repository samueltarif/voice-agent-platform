import type { LocalDevAccountInput } from './local-dev-account-input';

/**
 * Cria a conta local pelo Better Auth real (hash de senha do próprio Better
 * Auth) e, se pedido, uma organização local ACTIVE com o usuário como OWNER,
 * pelos repositórios existentes. Idempotente para organização e vínculo; não
 * redefine senha de conta existente. O resultado nunca contém a senha.
 */
export interface LocalDevAccountDeps {
  signUp(input: { email: string; password: string; name: string }): Promise<{ userId: string }>;
  findOrganizationBySlug(slug: string): Promise<{ id: string } | undefined>;
  createOrganization(input: { slug: string; name: string }): Promise<{ id: string }>;
  hasMembership(input: { organizationId: string; userId: string }): Promise<boolean>;
  createOwnerMembership(input: { organizationId: string; userId: string }): Promise<void>;
}

export type LocalDevAccountResult =
  | {
      readonly kind: 'CREATED';
      readonly email: string;
      readonly organization: { readonly slug: string; readonly created: boolean } | null;
    }
  | { readonly kind: 'ALREADY_EXISTS'; readonly email: string };

function isUserAlreadyExists(error: unknown): boolean {
  const body = (error as { body?: { code?: unknown } } | null)?.body;
  return (
    body?.code === 'USER_ALREADY_EXISTS' || body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
  );
}

async function ensureOwnerOrganization(
  deps: LocalDevAccountDeps,
  organization: { slug: string; name: string },
  userId: string,
): Promise<{ slug: string; created: boolean }> {
  const existing = await deps.findOrganizationBySlug(organization.slug);
  const org = existing ?? (await deps.createOrganization(organization));
  if (!(await deps.hasMembership({ organizationId: org.id, userId }))) {
    await deps.createOwnerMembership({ organizationId: org.id, userId });
  }
  return { slug: organization.slug, created: existing === undefined };
}

export async function createLocalDevAccount(
  input: LocalDevAccountInput & { readonly password: string },
  deps: LocalDevAccountDeps,
): Promise<LocalDevAccountResult> {
  let userId: string;
  try {
    ({ userId } = await deps.signUp({
      email: input.email,
      password: input.password,
      name: input.name,
    }));
  } catch (error) {
    if (isUserAlreadyExists(error)) return { kind: 'ALREADY_EXISTS', email: input.email };
    throw error;
  }
  const organization = input.organization
    ? await ensureOwnerOrganization(deps, input.organization, userId)
    : null;
  return { kind: 'CREATED', email: input.email, organization };
}
