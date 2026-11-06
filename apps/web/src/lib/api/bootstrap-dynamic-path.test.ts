import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapApiClient } from './bootstrap-api-client.js';
import { InternalApiClient } from './internal-api-client.js';
import { UnsafeInternalApiPathError } from './internal-api-path.js';
import { SwitchOrganizationService } from '../organization/switch-organization-service.js';

/**
 * NB-1 (revisão da #148): o caminho de bootstrap é montado em tempo de execução com o
 * slug codificado (`/v1/me/organizations/${encodeURIComponent(slug)}`). Aqui o cliente
 * real recebe slugs legítimos e hostis; o fetch simulado prova o URL exato ou a ausência
 * de chamada. Também cobre a URL base com barra final (RR-1 da revisão).
 */
const BASE = 'http://api.internal:3002';
const ORG_RESPONSE = { id: 'o1', slug: 'org-alpha', name: 'Org Alpha', role: 'OWNER' };
const { privateKey } = generateKeyPairSync('ed25519');
const jwk = privateKey.export({ format: 'jwk' });
const fetchFn = vi.fn(async () => new Response(JSON.stringify(ORG_RESPONSE), { status: 200 }));

function bootstrapClient(baseUrl = BASE): BootstrapApiClient {
  return new BootstrapApiClient({ baseUrl, privateJwk: jwk, kid: 'k1', fetchFn });
}

function calledUrl(): string {
  return (fetchFn.mock.calls.at(-1) as unknown as [string])[0];
}

beforeEach(() => vi.clearAllMocks());

describe('bootstrap organization path — dynamic slug through the real client (NB-1)', () => {
  it.each([
    ['org-alpha', '/v1/me/organizations/org-alpha'],
    ['a b', '/v1/me/organizations/a%20b'],
    ['a#b', '/v1/me/organizations/a%23b'],
    ['a?b=1', '/v1/me/organizations/a%3Fb%3D1'],
    ['café', '/v1/me/organizations/caf%C3%A9'],
  ])('slug %j → exact URL on the API origin', async (slug, path) => {
    await bootstrapClient().getOrganizationBySlug('user-1', slug);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(calledUrl()).toBe(`${BASE}${path}`);
    expect(new URL(calledUrl()).origin).toBe(BASE);
  });

  it.each(['', '.', '..', '../x', 'a/b', 'a\\b', '%2e%2e', '%2F', '..%2Fadmin'])(
    'hostile slug %j is refused before any network call',
    async (slug) => {
      await expect(bootstrapClient().getOrganizationBySlug('user-1', slug)).rejects.toBeInstanceOf(
        UnsafeInternalApiPathError,
      );
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('switch-organization validates the slug first and answers uniformly', async () => {
    const service = new SwitchOrganizationService();
    const answers = new Set<string>();
    for (const slug of ['..', '../x', 'a/b', '%2e%2e', 'Org Alpha', 'a\\b']) {
      const result = await service.switchOrganization({
        userId: 'user-1',
        slug,
        bootstrapClient: bootstrapClient(),
      });
      expect(result.success, slug).toBe(false);
      answers.add(JSON.stringify(result));
    }
    expect(answers.size).toBe(1);
    expect(fetchFn).not.toHaveBeenCalled();
    const ok = await service.switchOrganization({
      userId: 'user-1',
      slug: 'org-alpha',
      bootstrapClient: bootstrapClient(),
    });
    expect(ok).toEqual({ success: true, organization: { slug: 'org-alpha', name: 'Org Alpha' } });
    expect(calledUrl()).toBe(`${BASE}/v1/me/organizations/org-alpha`);
  });
});

describe('client base URL with a trailing slash (RR-1 of the #148 review)', () => {
  it('both clients strip one trailing slash and keep the exact URL', async () => {
    await bootstrapClient(`${BASE}/`).getOrganizationBySlug('user-1', 'org-alpha');
    expect(calledUrl()).toBe(`${BASE}/v1/me/organizations/org-alpha`);
    const internal = new InternalApiClient({
      baseUrl: `${BASE}/`,
      privateJwk: jwk,
      kid: 'k1',
      fetchFn,
    });
    await internal.request({ method: 'GET', path: '/v1/agents', userId: 'u', organizationId: 'o' });
    expect(calledUrl()).toBe(`${BASE}/v1/agents`);
  });
});
