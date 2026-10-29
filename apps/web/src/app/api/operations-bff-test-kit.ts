import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { getServerOrganizationContext } from '../../lib/organization/server-organization-context.js';
import { getInternalApiClient } from '../../lib/api/api-client-factory.js';

/**
 * Apoio de teste do BFF de operações (importado só por `*.test.ts`, que devem
 * declarar `vi.mock` dos dois módulos abaixo).
 */
export const ORIGIN = 'http://localhost:3000';
export const ORG_ID = '0b9f7c1e-1d2a-4c3b-8e4f-5a6b7c8d9e0f';

export function resolveTenant(role = 'MANAGER'): void {
  vi.mocked(getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: ORG_ID, slug: 'org-a', name: 'Org A', role: role as never },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  });
}

export function mockApi(...responses: unknown[]) {
  const request = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) request.mockRejectedValueOnce(r);
    else request.mockResolvedValueOnce(r);
  }
  vi.mocked(getInternalApiClient).mockReturnValue({ request } as never);
  return request;
}

export function apiError(status: number, code?: string): Error {
  return Object.assign(new Error('api'), {
    status,
    data: code ? { error: { code, message: 'internal detail' } } : undefined,
  });
}

export function operationsReq(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      host: 'localhost:3000',
      origin: ORIGIN,
      'x-operations-org-slug': 'org-a',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    ...(init.body === undefined
      ? {}
      : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  });
}

export const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });
