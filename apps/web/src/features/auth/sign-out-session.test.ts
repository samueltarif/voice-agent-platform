import { describe, it, expect, vi } from 'vitest';
import { POST_LOGOUT_PATH, signOutSession, type SignOutClient } from './sign-out-session.js';

describe('signOutSession', () => {
  it('signs out when the server confirms and returns to /login', async () => {
    const signOut = vi.fn<SignOutClient>(async () => ({ error: null }));
    expect(await signOutSession(signOut)).toEqual({ kind: 'SIGNED_OUT' });
    expect(signOut.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
    expect(POST_LOGOUT_PATH).toBe('/login');
  });

  it('reports FAILED on a server error or a network failure (no silent success)', async () => {
    expect(await signOutSession(async () => ({ error: { status: 500 } }))).toEqual({
      kind: 'FAILED',
    });
    expect(
      await signOutSession(async () => {
        throw new TypeError('network');
      }),
    ).toEqual({ kind: 'FAILED' });
  });

  it('reports TIMEOUT and aborts when the server never answers', async () => {
    vi.useFakeTimers();
    try {
      let captured: AbortSignal | undefined;
      const pending = signOutSession(({ signal }) => {
        captured = signal;
        return new Promise(() => {});
      }, 300);
      await vi.advanceTimersByTimeAsync(300);
      expect(await pending).toEqual({ kind: 'TIMEOUT' });
      expect(captured?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
