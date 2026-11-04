'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@voice-agent/ui';
import { authClient } from '../../lib/auth/auth-client';
import { POST_LOGOUT_PATH, SIGN_OUT_ERROR_MESSAGE, signOutSession } from './sign-out-session';

/** Botão "Sair": encerra a sessão no servidor e volta para o login. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const outcome = await signOutSession(({ signal }) =>
      authClient.signOut({ fetchOptions: { signal } }),
    );
    if (outcome.kind === 'SIGNED_OUT') {
      router.replace(POST_LOGOUT_PATH);
      router.refresh();
      return;
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="text-xs text-destructive" data-testid="sign-out-error">
          {SIGN_OUT_ERROR_MESSAGE}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        disabled={pending}
        className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
        aria-label="Sair"
        data-testid="sign-out-button"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-4 w-4" aria-hidden />
        )}
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </div>
  );
}
