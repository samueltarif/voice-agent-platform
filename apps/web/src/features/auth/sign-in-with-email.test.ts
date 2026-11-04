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
    expect(signIn).toHaveBeenCalledWith({ email: VALID.email, password: VALID.password });
    expect(Object.keys(signIn.mock.calls[0]![0]).sort()).toEqual(['email', 'password']);
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
