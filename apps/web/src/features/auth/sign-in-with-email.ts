/**
 * Login por e-mail e senha pela infraestrutura existente (Better Auth).
 * Função pura sobre o cliente injetado: sem usuário fictício, sem atalho de
 * sessão. A mensagem ao usuário é genérica para não revelar se o e-mail existe.
 */

/**
 * Destino fixo após o login: a organização ativa é resolvida no servidor.
 * Fica em módulo comum (não `'use client'`) porque a página de servidor também
 * o importa — uma exportação de módulo cliente viraria referência de cliente.
 */
export const POST_LOGIN_PATH = '/dashboard';

export interface EmailCredentials {
  readonly email: string;
  readonly password: string;
}

/** Forma mínima do retorno do cliente Better Auth (`{ data, error }`). */
export interface SignInClientResult {
  readonly data: unknown;
  readonly error: { readonly status: number } | null;
}

export type SignInEmailClient = (credentials: EmailCredentials) => Promise<SignInClientResult>;

export type SignInOutcome =
  | { readonly kind: 'SIGNED_IN' }
  | { readonly kind: 'INVALID_INPUT' }
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'RATE_LIMITED' }
  | { readonly kind: 'UNAVAILABLE' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REJECTED_CREDENTIAL_STATUSES = new Set([400, 401, 403]);

export const SIGN_IN_MESSAGES: Readonly<
  Record<Exclude<SignInOutcome['kind'], 'SIGNED_IN'>, string>
> = {
  INVALID_INPUT: 'Informe um e-mail válido e a senha.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um momento e tente novamente.',
  UNAVAILABLE: 'Não foi possível entrar agora. Tente novamente em instantes.',
};

function classifyError(status: number): SignInOutcome {
  if (REJECTED_CREDENTIAL_STATUSES.has(status)) return { kind: 'INVALID_CREDENTIALS' };
  if (status === 429) return { kind: 'RATE_LIMITED' };
  return { kind: 'UNAVAILABLE' };
}

export async function signInWithEmail(
  input: EmailCredentials,
  signIn: SignInEmailClient,
): Promise<SignInOutcome> {
  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email) || input.password.length === 0) {
    return { kind: 'INVALID_INPUT' };
  }
  try {
    // Apenas e-mail e senha: nenhuma organização ou destino vem do formulário.
    const result = await signIn({ email, password: input.password });
    if (result.error) return classifyError(result.error.status);
    return result.data ? { kind: 'SIGNED_IN' } : { kind: 'UNAVAILABLE' };
  } catch {
    return { kind: 'UNAVAILABLE' };
  }
}
