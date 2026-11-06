import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { InternalApiClient } from '../../../../lib/api/internal-api-client.js';
import { toListPath } from '../knowledge-request-parsers.js';
import { GET } from './route.js';

/**
 * NB-1 (revisão da #148): o caminho da listagem de conhecimento é montado em tempo de
 * execução por `toListPath`, fora do alcance da varredura textual. Aqui a rota real
 * monta o caminho a partir da query do usuário e o InternalApiClient real o envia a um
 * fetch simulado: o URL final é comparado com o valor esperado escrito à mão.
 */
vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const BASE = 'http://api.internal:3002';
const LIST = `${BASE}/v1/knowledge/documents`;
const fetchFn = vi.fn(async () => new Response('[]', { status: 200 }));
const { privateKey } = generateKeyPairSync('ed25519');

/** Valor de `collection` enviado pelo usuário → query que deve chegar à API. */
const COLLECTIONS: [string, string][] = [
  ['vendas', 'collection=vendas'],
  ['a b#c', 'collection=a+b%23c'],
  ['../../v1/me/organizations', 'collection=..%2F..%2Fv1%2Fme%2Forganizations'],
  ['x?status=ARCHIVED&limit=1', 'collection=x%3Fstatus%3DARCHIVED%26limit%3D1'],
  ['a\\b', 'collection=a%5Cb'],
  ['%2e%2e%2F', 'collection=%252e%252e%252F'],
  ['//evil.example/x', 'collection=%2F%2Fevil.example%2Fx'],
  ['café', 'collection=caf%C3%A9'],
];

function list(query: string) {
  const req = new NextRequest(`http://localhost:3000/api/knowledge/documents${query}`, {
    method: 'GET',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
    },
  });
  return GET(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(serverOrgContext.getServerOrganizationContext).mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role: 'MANAGER' },
    user: { id: 'user-1', email: 'u@example.test' },
    availableOrganizations: [],
  } as never);
  vi.mocked(clientFactory.getInternalApiClient).mockReturnValue(
    new InternalApiClient({
      baseUrl: BASE,
      privateJwk: privateKey.export({ format: 'jwk' }),
      kid: 'k1',
      fetchFn,
    }),
  );
});

describe('knowledge list — dynamic path through the real caller (NB-1)', () => {
  it.each(COLLECTIONS)('collection %j reaches only the list endpoint', async (value, query) => {
    const res = await list(`?collection=${encodeURIComponent(value)}`);
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = (fetchFn.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe(`${LIST}?${query}`);
    const parsed = new URL(url);
    expect(parsed.origin).toBe(BASE);
    expect(parsed.pathname).toBe('/v1/knowledge/documents');
    expect(parsed.hash).toBe('');
    expect([...parsed.searchParams.keys()]).toEqual(['collection']);
    expect(parsed.searchParams.get('collection')).toBe(value);
  });

  it('keeps the exact URL for paging and status filters', async () => {
    await list('?limit=5&offset=10&status=READY');
    expect(fetchFn).toHaveBeenCalledWith(
      `${LIST}?limit=5&offset=10&status=READY`,
      expect.anything(),
    );
    await list('');
    expect(fetchFn).toHaveBeenLastCalledWith(LIST, expect.anything());
  });

  it('never forwards unknown query keys (allow-list), so they cannot reshape the URL', async () => {
    await list('?collection=a&path=/v1/me/organizations&__proto__=x&limit=3');
    expect(fetchFn).toHaveBeenCalledWith(`${LIST}?limit=3&collection=a`, expect.anything());
  });

  it('refuses an invalid query value before any network call', async () => {
    const res = await list('?status=../../v1/me');
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('toListPath never emits a raw separator, fragment or backslash', () => {
    for (const [collection] of COLLECTIONS) {
      const path = toListPath({ collection, limit: 2, offset: 0 });
      const [pathname, search] = path.split('?');
      expect(pathname).toBe('/v1/knowledge/documents');
      expect(search).not.toMatch(/[#\\/\s]/);
    }
  });
});
