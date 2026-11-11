import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  deleteKnowledgeDocument,
  fetchOrganizationAgents,
  restoreKnowledgeDocument,
  setKnowledgeDocumentAgent,
  updateKnowledgeDocument,
} from './knowledge-document-management-client';

const fetchMock = vi.fn();
const DOC = { id: '22222222-2222-2222-2222-222222222222', updatedAt: '2026-11-11T12:00:00.000Z' };

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function call(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe('knowledge document management client (DEC-054)', () => {
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends the concurrency token and the displayed organization on every operation', async () => {
    fetchMock.mockImplementation(() => reply({ document: { id: DOC.id } }));
    await updateKnowledgeDocument('org-a', DOC, { title: 'Novo', collection: null });
    await setKnowledgeDocumentAgent('org-a', DOC, null);
    await restoreKnowledgeDocument('org-a', DOC);
    await deleteKnowledgeDocument('org-a', DOC);
    const calls = [0, 1, 2, 3].map(call);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['PATCH', `/api/knowledge/documents/${DOC.id}`],
      ['PUT', `/api/knowledge/documents/${DOC.id}/agent`],
      ['POST', `/api/knowledge/documents/${DOC.id}/restore`],
      [
        'DELETE',
        `/api/knowledge/documents/${DOC.id}?expectedUpdatedAt=${encodeURIComponent(DOC.updatedAt)}`,
      ],
    ]);
    expect(calls[0]!.body).toEqual({
      expectedUpdatedAt: DOC.updatedAt,
      title: 'Novo',
      collection: null,
    });
    expect(calls[1]!.body).toEqual({ expectedUpdatedAt: DOC.updatedAt, agentId: null });
    expect(calls[2]!.body).toEqual({ expectedUpdatedAt: DOC.updatedAt });
    expect(calls[3]!.body).toBeUndefined();
    for (const c of calls) expect(c.headers['x-knowledge-org-slug']).toBe('org-a');
  });

  it('returns the updated document and raises the safe server error', async () => {
    fetchMock.mockImplementationOnce(() => reply({ document: { id: DOC.id, title: 'Novo' } }));
    await expect(updateKnowledgeDocument('org-a', DOC, { title: 'Novo' })).resolves.toEqual({
      id: DOC.id,
      title: 'Novo',
    });
    fetchMock.mockImplementationOnce(() =>
      reply({ error: 'Nenhuma alteração para salvar.', code: 'KNOWLEDGE_NO_CHANGES' }, 400),
    );
    await expect(updateKnowledgeDocument('org-a', DOC, {})).rejects.toEqual({
      message: 'Nenhuma alteração para salvar.',
      code: 'KNOWLEDGE_NO_CHANGES',
      status: 400,
    });
  });

  it('lists organization agents, ignoring malformed entries', async () => {
    fetchMock.mockImplementationOnce(() =>
      reply({ agents: [{ id: 'a1', name: 'Atendente', status: 'ACTIVE' }, { id: 2 }, null] }),
    );
    await expect(fetchOrganizationAgents()).resolves.toEqual([
      { id: 'a1', name: 'Atendente', status: 'ACTIVE' },
    ]);
    fetchMock.mockImplementationOnce(() => reply({ error: 'x' }, 403));
    await expect(fetchOrganizationAgents()).rejects.toMatchObject({ status: 403 });
  });
});
