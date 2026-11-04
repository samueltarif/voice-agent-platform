/**
 * Encerramento de sessão pelo Better Auth (revoga a sessão no servidor e limpa
 * o cookie). Sempre termina: tempo limite e falha viram resultado explícito.
 */

export const SIGN_OUT_TIMEOUT_MS = 10_000;
export const POST_LOGOUT_PATH = '/login';

export type SignOutClient = (options: {
  readonly signal: AbortSignal;
}) => Promise<{ readonly error: { readonly status: number } | null }>;

export type SignOutOutcome =
  { readonly kind: 'SIGNED_OUT' } | { readonly kind: 'FAILED' } | { readonly kind: 'TIMEOUT' };

export const SIGN_OUT_ERROR_MESSAGE = 'Não foi possível sair agora. Tente novamente.';

export async function signOutSession(
  signOut: SignOutClient,
  timeoutMs: number = SIGN_OUT_TIMEOUT_MS,
): Promise<SignOutOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SignOutOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'TIMEOUT' });
    }, timeoutMs);
  });
  const request = signOut({ signal: controller.signal }).then(
    (result): SignOutOutcome => (result.error ? { kind: 'FAILED' } : { kind: 'SIGNED_OUT' }),
    (): SignOutOutcome => (controller.signal.aborted ? { kind: 'TIMEOUT' } : { kind: 'FAILED' }),
  );
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
