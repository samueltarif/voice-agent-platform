import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './documents/route.js';
import { GET as DetailGET } from './documents/[documentId]/route.js';
import { POST as ArchivePOST } from './documents/[documentId]/archive/route.js';
import * as serverOrgContext from '../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../lib/api/tenant-api-client.js';

vi.mock('../../../lib/organization/server-organization-context.js');
vi.mock('../../../lib/api/api-client-factory.js');

const DOC_ID = '22222222-2222-2222-2222-222222222222';
const BASE = 'http://localhost:3000/api/knowledge/documents';
const VALID_BODY = {
  title: 'FAQ',
  source: { sourceType: 'POLICY', locator: 'docs/faq.md' },
  rawText: 'Conteúdo',
};

function req(url: string, method: string, headers: Record<string, string>, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function activeOrg(role = 'OWNER') {
  return {
    status: 'RESOLVED' as const,
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  } as unknown as Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>;
}

const params = { params: Promise.resolve({ documentId: DOC_ID }) };

describe('knowledge BFF organization consistency (F-S2) and origin (F-S3)', () => {
  const mockTenantRequest = vi.fn().mockResolvedValue({ id: DOC_ID });

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantRequest.mockResolvedValue({ id: DOC_ID });
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(activeOrg());
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue({
      request: vi.fn(),
    } as unknown as ReturnType<typeof clientFactory.getInternalApiClient>);
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(mockTenantRequest);
  });

  const calls: ReadonlyArray<{
    name: string;
    run: (headers: Record<string, string>) => Promise<Response>;
  }> = [
    { name: 'list', run: (h) => GET(req(BASE, 'GET', h)) },
    { name: 'ingest', run: (h) => POST(req(BASE, 'POST', h, VALID_BODY)) },
    { name: 'detail', run: (h) => DetailGET(req(`${BASE}/${DOC_ID}`, 'GET', h), params) },
    {
      name: 'archive',
      run: (h) => ArchivePOST(req(`${BASE}/${DOC_ID}/archive`, 'POST', h), params),
    },
  ];

  for (const { name, run } of calls) {
    it(`${name}: forwards when the declared org matches the active org`, async () => {
      const res = await run({ 'x-knowledge-org-slug': 'org-a' });
      expect(res.status).toBeLessThan(300);
      expect(mockTenantRequest).toHaveBeenCalledTimes(1);
    });

    it(`${name}: rejects with 409 ORG_CONTEXT_MISMATCH when another tab switched org`, async () => {
      const res = await run({ 'x-knowledge-org-slug': 'org-b' });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe('ORG_CONTEXT_MISMATCH');
      expect(mockTenantRequest).not.toHaveBeenCalled();
    });

    it(`${name}: rejects with 400 when the org header is missing or invalid`, async () => {
      for (const headers of [{}, { 'x-knowledge-org-slug': 'Org A!' }]) {
        const res = await run(headers);
        expect(res.status).toBe(400);
        expect(((await res.json()) as { code: string }).code).toBe('ORG_CONTEXT_REQUIRED');
      }
      expect(mockTenantRequest).not.toHaveBeenCalled();
    });

    it(`${name}: rejects cross-origin requests with 403 before any org or API work`, async () => {
      const res = await run({
        origin: 'https://evil.example',
        'x-knowledge-org-slug': 'org-a',
      });
      expect(res.status).toBe(403);
      expect(serverOrgContext.getServerOrganizationContext).not.toHaveBeenCalled();
      expect(mockTenantRequest).not.toHaveBeenCalled();
    });

    it(`${name}: rejects spoofed x-forwarded-host requests with 403 before any org or API work`, async () => {
      const res = await run({
        origin: 'https://evil.example',
        'x-forwarded-host': 'evil.example',
        'x-knowledge-org-slug': 'org-a',
      });
      expect(res.status).toBe(403);
      expect(serverOrgContext.getServerOrganizationContext).not.toHaveBeenCalled();
      expect(mockTenantRequest).not.toHaveBeenCalled();
    });
  }

  it('does not let the header bypass RBAC: MANAGER archive stays 403 on matching org', async () => {
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(
      activeOrg('MANAGER'),
    );
    const res = await ArchivePOST(
      req(`${BASE}/${DOC_ID}/archive`, 'POST', { 'x-knowledge-org-slug': 'org-a' }),
      params,
    );
    expect(res.status).toBe(403);
    expect(mockTenantRequest).not.toHaveBeenCalled();
  });
});
