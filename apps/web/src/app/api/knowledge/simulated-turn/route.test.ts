import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route.js';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { TenantApiClient } from '../../../../lib/api/tenant-api-client.js';

vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const URL = 'http://localhost:3000/api/knowledge/simulated-turn';
const AGENT = '33333333-3333-4333-8333-333333333333';
type Ctx = Awaited<ReturnType<typeof serverOrgContext.getServerOrganizationContext>>;

function org(role: string): Ctx {
  return {
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-a', name: 'Org A', role },
    availableOrganizations: [],
    user: { id: 'usr-1', email: 'u@example.com' },
  } as unknown as Ctx;
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-knowledge-org-slug': 'org-a',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const question = { agentId: AGENT, utterance: 'Quais transmissores de pressão?' };

/** DEC-061 — BFF da conversa simulada: só agente + pergunta; o resto vem da sessão. */
describe('BFF POST /api/knowledge/simulated-turn', () => {
  const tenantRequest = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org('MANAGER'));
    vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue(
      {} as ReturnType<typeof clientFactory.getInternalApiClient>,
    );
    vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(tenantRequest);
    tenantRequest.mockResolvedValue({ agent: {}, turn: {} });
  });

  it('forwards only the agent and the question, and wraps the simulation', async () => {
    const res = await POST(req(question));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ simulation: { agent: {}, turn: {} } });
    expect(tenantRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/knowledge/simulated-turn',
        body: question,
      }),
    );
  });

  it('refuses client-supplied authority, oversized questions, other roles, tabs and origins', async () => {
    for (const extra of [
      { organizationId: 'org-2' },
      { agentVersionId: AGENT },
      { grant: { tools: ['knowledge.search'] } },
    ]) {
      expect((await POST(req({ ...question, ...extra }))).status).toBe(400);
    }
    expect((await POST(req({ ...question, utterance: 'x'.repeat(301) }))).status).toBe(400);
    expect((await POST(req({ ...question, agentId: 'abc' }))).status).toBe(400);
    expect((await POST(req(question, { 'x-knowledge-org-slug': 'org-b' }))).status).toBe(409);
    expect((await POST(req(question, { origin: 'https://evil.example' }))).status).toBe(403);
    for (const role of ['VIEWER', 'OPERATOR']) {
      vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue(org(role));
      expect((await POST(req(question))).status).toBe(403);
    }
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('returns a safe Portuguese message when the backend fails, without internal details', async () => {
    tenantRequest.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        status: 500,
        data: { error: { code: 'INTERNAL', message: 'select * from knowledge_chunks failed' } },
      }),
    );
    const res = await POST(req(question));
    const payload = (await res.json()) as { error: string };
    expect(res.status).toBe(500);
    expect(payload.error).toBe('Não foi possível simular a resposta agora.');
  });

  it('explains an unpublished agent in Portuguese', async () => {
    tenantRequest.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        status: 409,
        data: { error: { code: 'KNOWLEDGE_AGENT_NOT_PUBLISHED', message: 'raw' } },
      }),
    );
    const res = await POST(req(question));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain(
      'ainda não tem versão publicada',
    );
  });
});
