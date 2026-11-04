import { describe, it, expect, vi } from 'vitest';
import { SIGN_IN_MESSAGES, signInWithEmail, type SignInEmailClient } from './sign-in-with-email.js';

const VALID = { email: 'pessoa@example.com', password: 'segredo-local' };

function client(result: Awaited<ReturnType<SignInEmailClient>>) {
  return vi.fn<SignInEmailClient>(async () => result);
}

describe('signInWithEmail (Better Auth email/password)', () => {
  it('rejects invalid input locally without calling the auth client', async () => {
    const signIn = client({ data: {}, error: null });
    expect(await signInWithEmail({ email: 'sem-arroba', password: 'x' }, signIn)).toEqual({
      kind: 'INVALID_INPUT',
    });
    expect(await signInWithEmail({ email: VALID.email, password: '' }, signIn)).toEqual({
      kind: 'INVALID_INPUT',
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in only when the auth client returns data and no error', async () => {
    const signIn = client({ data: { user: { id: 'usr-1' } }, error: null });
    expect(await signInWithEmail({ ...VALID, email: '  pessoa@example.com ' }, signIn)).toEqual({
      kind: 'SIGNED_IN',
    });
    // Somente e-mail (normalizado) e senha: nenhuma organização, papel ou destino.
    // TEST_CHANGE_REASON = SIGNATURE_EXTENDED_WITH_ABORT_SIGNAL (ASSERTION_EQUIVALENT):
    // o 1º argumento continua exatamente { email, password }; o 2º traz só o sinal.
    const [credentials, options] = signIn.mock.calls[0]!;
    expect(credentials).toEqual({ email: VALID.email, password: VALID.password });
    expect(Object.keys(credentials).sort()).toEqual(['email', 'password']);
    expect(Object.keys(options)).toEqual(['signal']);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([400, 401, 403])('maps status %i to a generic invalid-credentials outcome', async (s) => {
    const out = await signInWithEmail(VALID, client({ data: null, error: { status: s } }));
    expect(out).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(SIGN_IN_MESSAGES.INVALID_CREDENTIALS).toBe('E-mail ou senha incorretos.');
  });

  it('maps 429 to rate limited and server or network failures to unavailable', async () => {
    expect(await signInWithEmail(VALID, client({ data: null, error: { status: 429 } }))).toEqual({
      kind: 'RATE_LIMITED',
    });
    expect(await signInWithEmail(VALID, client({ data: null, error: { status: 500 } }))).toEqual({
      kind: 'UNAVAILABLE',
    });
    const throwing = vi.fn<SignInEmailClient>(async () => {
      throw new TypeError('network');
    });
    expect(await signInWithEmail(VALID, throwing)).toEqual({ kind: 'UNAVAILABLE' });
  });

  it('never reports success without data, even if no error is returned', async () => {
    expect(await signInWithEmail(VALID, client({ data: null, error: null }))).toEqual({
      kind: 'UNAVAILABLE',
    });
  });
});

describe('POST_LOGIN_PATH', () => {
  it('is a fixed same-origin path (no open redirect, no organization in the URL)', async () => {
    const { POST_LOGIN_PATH } = await import('./sign-in-with-email.js');
    expect(POST_LOGIN_PATH).toBe('/dashboard');
  });
});

describe('signInWithEmail never leaves the form loading forever', () => {
  it('maps INVALID_ORIGIN to a configuration message, not to wrong credentials', async () => {
    const out = await signInWithEmail(
      VALID,
      client({ data: null, error: { status: 403, code: 'INVALID_ORIGIN' } }),
    );
    expect(out).toEqual({ kind: 'ORIGIN_REJECTED' });
    expect(SIGN_IN_MESSAGES.ORIGIN_REJECTED).not.toBe(SIGN_IN_MESSAGES.INVALID_CREDENTIALS);
  });

  it('resolves TIMEOUT and aborts the request when the server never answers', async () => {
    vi.useFakeTimers();
    try {
      let captured: AbortSignal | undefined;
      const hanging = vi.fn<SignInEmailClient>((_c, { signal }) => {
        captured = signal;
        return new Promise(() => {}); // nunca responde (porta ocupada por outro processo)
      });
      const pending = signInWithEmail(VALID, hanging, 1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ kind: 'TIMEOUT' });
      expect(captured?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports TIMEOUT when the client rejects because the request was aborted', async () => {
    vi.useFakeTimers();
    try {
      const abortable = vi.fn<SignInEmailClient>(
        (_c, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = signInWithEmail(VALID, abortable, 500);
      await vi.advanceTimersByTimeAsync(500);
      expect(await pending).toEqual({ kind: 'TIMEOUT' });
    } finally {
      vi.useRealTimers();
    }
  });
});
