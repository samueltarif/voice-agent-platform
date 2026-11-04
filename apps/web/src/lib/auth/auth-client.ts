import { createAuthClient } from 'better-auth/react';

/**
 * Sem `NEXT_PUBLIC_APP_URL`, o Better Auth usa a origem da própria página
 * (`window.location.origin`). Antes havia um padrão fixo `http://localhost:3000`:
 * com o Next.js em outra porta (ex.: 3001), o login era enviado para a porta
 * errada e podia ficar aguardando indefinidamente.
 */
const explicitBaseURL = process.env.NEXT_PUBLIC_APP_URL;

export const authClient = createAuthClient(explicitBaseURL ? { baseURL: explicitBaseURL } : {});
