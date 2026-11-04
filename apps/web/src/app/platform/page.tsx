import * as React from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { auth } from '../../lib/auth/auth';
import { PlatformDemoView } from '../../features/platform/platform-demo-view';

export const dynamic = 'force-dynamic';

/**
 * `/platform` ainda é só uma prévia com dados fictícios: não existe verificação
 * de administrador da plataforma no servidor. Por isso, em produção a rota não
 * existe (404) e, fora dela, exige sessão e se identifica como demonstração.
 */
export default async function PlatformPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
    return null;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect('/login');
    return null;
  }
  return <PlatformDemoView />;
}
