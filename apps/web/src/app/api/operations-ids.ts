import { NextResponse } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Id de rota inválido nunca chega à API (evita injeção de caminho). */
export function invalidId(id: string): NextResponse | null {
  return UUID.test(id) ? null : NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
}

/** Repassa apenas parâmetros de consulta conhecidos (lista branca). */
export function pickQuery(url: string, allowed: readonly string[]): string {
  const source = new URL(url).searchParams;
  const params = new URLSearchParams();
  for (const key of allowed) {
    const value = source.get(key);
    if (value !== null && /^[A-Za-z0-9_-]{1,32}$/.test(value)) params.set(key, value);
  }
  return params.size > 0 ? `?${params.toString()}` : '';
}
