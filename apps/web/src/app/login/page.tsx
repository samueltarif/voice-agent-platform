import * as React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth/auth';
import { LoginForm } from '../../features/auth/login-form';
import { POST_LOGIN_PATH } from '../../features/auth/sign-in-with-email';

export const dynamic = 'force-dynamic';

/**
 * Página pública de login. Com sessão válida, vai para o painel; sem sessão,
 * mostra o formulário. Usa o mesmo critério de sessão das páginas protegidas
 * (`session.user.id`), o que impede ciclo /login ⇄ /dashboard.
 */
export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    redirect(POST_LOGIN_PATH);
    return null;
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginForm />
    </main>
  );
}
