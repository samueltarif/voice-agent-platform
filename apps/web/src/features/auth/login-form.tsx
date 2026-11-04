'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@voice-agent/ui';
import { authClient } from '../../lib/auth/auth-client';
import { POST_LOGIN_PATH, SIGN_IN_MESSAGES, signInWithEmail } from './sign-in-with-email';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const outcome = await signInWithEmail({ email, password }, (credentials) =>
      authClient.signIn.email(credentials),
    );
    if (outcome.kind === 'SIGNED_IN') {
      router.replace(POST_LOGIN_PATH);
      router.refresh();
      return;
    }
    setMessage(SIGN_IN_MESSAGES[outcome.kind]);
    setPending(false);
  }

  return (
    <Card className="w-full max-w-sm" data-testid="login-card">
      <CardHeader>
        <CardTitle className="text-lg">Entrar</CardTitle>
        <p className="text-sm text-muted-foreground">Use o e-mail e a senha da sua conta.</p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit} data-testid="login-form" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-sm font-medium">
              Senha
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {message ? (
            <p role="alert" className="text-sm text-destructive" data-testid="login-error">
              {message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending} data-testid="login-submit">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
