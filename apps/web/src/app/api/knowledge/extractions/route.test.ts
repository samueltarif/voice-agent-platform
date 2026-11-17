import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { KNOWLEDGE_UPLOAD_LIMITS } from '@voice-agent/contracts';
import { POST } from './route.js';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const URL = 'http://localhost:3000/api/knowledge/extractions';
type Ctx = Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>;
const BODY = { fileName: 'catalogo.txt', contentBase64: 'T2zDoQ==' };

function org(role: string): Ctx {
  return {
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  } as unknown as Ctx;
}

function req(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });
}

/** Corpo em fluxo, sem Content-Length, que conta quantos bytes foram lidos. */
function streamOf(totalBytes: number, pulled: { bytes: number }): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(1024 * 1024).fill(0x61);
  return new ReadableStream({
    pull(controller) {
      if (pulled.bytes >= totalBytes) return controller.close();
      pulled.bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
}

describe('BFF POST /api/knowledge/extractions (DEC-065)', () => {
  const tenantRequest = vi.fn();
  const resolveContext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resolveContext.mockResolvedValue(org('MANAGER'));
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockImplementation(resolveContext);
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue(
      {} as ReturnType<typeof clientFactory.getInternalApiClient>,
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(tenantRequest);
    tenantRequest.mockResolvedValue({ text: 'Olá' });
  });

  it('forwards the validated file with a longer deadline and wraps the preview', async () => {
    const res = await POST(req(JSON.stringify(BODY)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ extraction: { text: 'Olá' } });
    expect(tenantRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/v1/knowledge/extractions', body: BODY, timeoutMs: 30_000 }),
    );
  });

  it('checks session and role BEFORE reading the body', async () => {
    resolveContext.mockResolvedValue(org('VIEWER'));
    const pulled = { bytes: 0 };
    const res = await POST(req(streamOf(4 * 1024 * 1024, pulled), {}));
    expect(res.status).toBe(403);
    expect(pulled.bytes).toBeLessThanOrEqual(1024 * 1024);
    resolveContext.mockResolvedValue({ status: 'UNAUTHENTICATED' } as unknown as Ctx);
    expect((await POST(req(JSON.stringify(BODY)))).status).toBe(401);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('refuses oversized bodies by header and by stream (413) without calling the API', async () => {
    const limit = KNOWLEDGE_UPLOAD_LIMITS.maxRequestBodyBytes;
    const declared = req(JSON.stringify(BODY), { 'content-length': String(limit + 1) });
    expect((await POST(declared)).status).toBe(413);
    const pulled = { bytes: 0 };
    const res = await POST(req(streamOf(limit + 4 * 1024 * 1024, pulled)));
    expect(res.status).toBe(413);
    expect(pulled.bytes).toBeLessThanOrEqual(limit + 2 * 1024 * 1024);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid bodies, other tabs and foreign origins', async () => {
    expect((await POST(req('{nope'))).status).toBe(400);
    expect((await POST(req(JSON.stringify({ ...BODY, organizationId: 'x' })))).status).toBe(400);
    const otherTab = req(JSON.stringify(BODY), { 'x-knowledge-org-slug': 'org-b' });
    expect((await POST(otherTab)).status).toBe(409);
    const foreign = req(JSON.stringify(BODY), { origin: 'https://evil.example' });
    expect((await POST(foreign)).status).toBe(403);
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('translates API refusals into Portuguese with the code', async () => {
    tenantRequest.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        status: 422,
        data: { error: { code: 'KNOWLEDGE_UPLOAD_MACRO_ENABLED', message: 'File rejected.' } },
      }),
    );
    const res = await POST(req(JSON.stringify(BODY)));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Documentos com macros não são aceitos.',
      code: 'KNOWLEDGE_UPLOAD_MACRO_ENABLED',
    });
  });
});
