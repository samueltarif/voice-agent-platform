/**
 * Login por e-mail e senha pela infraestrutura existente (Better Auth).
 * Função pura sobre o cliente injetado: sem usuário fictício, sem atalho de
 * sessão. A mensagem ao usuário é genérica para não revelar se o e-mail existe,
 * e a tentativa sempre termina (tempo limite) — nunca deixa o botão carregando.
 */

/**
 * Destino fixo após o login: a organização ativa é resolvida no servidor.
 * Fica em módulo comum (não `'use client'`) porque a página de servidor também
 * o importa — uma exportação de módulo cliente viraria referência de cliente.
 */
export const POST_LOGIN_PATH = '/dashboard';

export const SIGN_IN_TIMEOUT_MS = 15_000;

export interface EmailCredentials {
  readonly email: string;
  readonly password: string;
}

/** Forma mínima do retorno do cliente Better Auth (`{ data, error }`). */
export interface SignInClientResult {
  readonly data: unknown;
  readonly error: { readonly status: number; readonly code?: string | undefined } | null;
}

export type SignInEmailClient = (
  credentials: EmailCredentials,
  options: { readonly signal: AbortSignal },
) => Promise<SignInClientResult>;

export type SignInOutcome =
  | { readonly kind: 'SIGNED_IN' }
  | { readonly kind: 'INVALID_INPUT' }
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'ORIGIN_REJECTED' }
  | { readonly kind: 'RATE_LIMITED' }
  | { readonly kind: 'TIMEOUT' }
  | { readonly kind: 'UNAVAILABLE' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REJECTED_CREDENTIAL_STATUSES = new Set([400, 401, 403]);

export const SIGN_IN_MESSAGES: Readonly<
  Record<Exclude<SignInOutcome['kind'], 'SIGNED_IN'>, string>
> = {
  INVALID_INPUT: 'Informe um e-mail válido e a senha.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  ORIGIN_REJECTED:
    'O endereço desta página não é aceito pelo servidor de autenticação. Avise o administrador.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um momento e tente novamente.',
  TIMEOUT: 'O servidor de autenticação não respondeu a tempo. Tente novamente.',
  UNAVAILABLE: 'Não foi possível entrar agora. Tente novamente em instantes.',
};

function classifyError(error: { status: number; code?: string | undefined }): SignInOutcome {
  if (error.status === 403 && error.code === 'INVALID_ORIGIN') return { kind: 'ORIGIN_REJECTED' };
  if (REJECTED_CREDENTIAL_STATUSES.has(error.status)) return { kind: 'INVALID_CREDENTIALS' };
  if (error.status === 429) return { kind: 'RATE_LIMITED' };
  return { kind: 'UNAVAILABLE' };
}

async function attempt(
  credentials: EmailCredentials,
  signIn: SignInEmailClient,
  signal: AbortSignal,
): Promise<SignInOutcome> {
  try {
    const result = await signIn(credentials, { signal });
    if (result.error) return classifyError(result.error);
    return result.data ? { kind: 'SIGNED_IN' } : { kind: 'UNAVAILABLE' };
  } catch {
    return signal.aborted ? { kind: 'TIMEOUT' } : { kind: 'UNAVAILABLE' };
  }
}

export async function signInWithEmail(
  input: EmailCredentials,
  signIn: SignInEmailClient,
  timeoutMs: number = SIGN_IN_TIMEOUT_MS,
): Promise<SignInOutcome> {
  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email) || input.password.length === 0) {
    return { kind: 'INVALID_INPUT' };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // O tempo limite vence mesmo que o cliente ignore o sinal de cancelamento.
  const timeout = new Promise<SignInOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'TIMEOUT' });
    }, timeoutMs);
  });
  try {
    // Apenas e-mail e senha: nenhuma organização ou destino vem do formulário.
    return await Promise.race([
      attempt({ email, password: input.password }, signIn, controller.signal),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
