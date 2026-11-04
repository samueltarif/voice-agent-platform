import { isValidOrganizationSlug } from '../organization/active-organization-context';

/**
 * Argumentos do comando de conta local. A senha nunca vem da linha de comando
 * (ficaria no histórico do terminal): vem de prompt oculto ou da variável
 * `LOCAL_DEV_ACCOUNT_PASSWORD`.
 */
export interface LocalDevAccountInput {
  readonly email: string;
  readonly name: string;
  readonly organization: { readonly slug: string; readonly name: string } | null;
}

export const MIN_LOCAL_DEV_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_FLAGS = new Set(['--email', '--name', '--org-slug', '--org-name']);

export class LocalDevAccountInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDevAccountInputError';
  }
}

function readFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    if (flag === '--password') {
      throw new LocalDevAccountInputError(
        'Não passe a senha na linha de comando. Use o prompt ou LOCAL_DEV_ACCOUNT_PASSWORD.',
      );
    }
    if (!KNOWN_FLAGS.has(flag) || value === undefined || value.startsWith('--')) {
      throw new LocalDevAccountInputError(`Argumento inválido: ${flag}`);
    }
    flags.set(flag, value.trim());
  }
  return flags;
}

function readOrganization(flags: Map<string, string>): LocalDevAccountInput['organization'] {
  const slug = flags.get('--org-slug');
  const name = flags.get('--org-name');
  if (!slug && !name) return null;
  if (!slug || !name) {
    throw new LocalDevAccountInputError('Informe --org-slug e --org-name juntos.');
  }
  if (!isValidOrganizationSlug(slug)) {
    throw new LocalDevAccountInputError(
      '--org-slug inválido (use letras minúsculas, números e -).',
    );
  }
  return { slug, name };
}

export function parseLocalDevAccountArgs(argv: readonly string[]): LocalDevAccountInput {
  const flags = readFlags(argv);
  const email = flags.get('--email')?.toLowerCase() ?? '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new LocalDevAccountInputError('Informe --email com um e-mail válido.');
  }
  return {
    email,
    name: flags.get('--name') || 'Conta local de desenvolvimento',
    organization: readOrganization(flags),
  };
}

export function assertLocalDevPassword(password: string): void {
  if (password.length < MIN_LOCAL_DEV_PASSWORD_LENGTH) {
    throw new LocalDevAccountInputError(
      `A senha precisa ter pelo menos ${MIN_LOCAL_DEV_PASSWORD_LENGTH} caracteres.`,
    );
  }
}
