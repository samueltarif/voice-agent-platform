import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  archiveKnowledgeDocument,
  fetchKnowledgeDocuments,
  ingestKnowledgeDocument,
} from './knowledge-documents-client';

const fetchMock = vi.fn();

function ok(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function sentHeaders(): Record<string, string> {
  return (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
}

describe('knowledge documents client sends the displayed organization (F-S2)', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('adds the org header to list, ingest and archive requests', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(() => ok({ documents: [] }));
    await fetchKnowledgeDocuments('org-a', {});
    expect(sentHeaders()['x-knowledge-org-slug']).toBe('org-a');

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => ok({ id: 'x' }, 201));
    await ingestKnowledgeDocument('org-a', {
      title: 't',
      locator: 'l',
      sourceType: 'POLICY',
      rawText: 'r',
    });
    expect(sentHeaders()['x-knowledge-org-slug']).toBe('org-a');
    expect(sentHeaders()['Content-Type']).toBe('application/json');

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => ok({ document: {} }));
    await archiveKnowledgeDocument('org-a', 'doc-1');
    expect(sentHeaders()['x-knowledge-org-slug']).toBe('org-a');
  });

  it('surfaces the BFF error code so the UI can detect an organization change', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(() =>
      ok({ error: 'A organização ativa mudou.', code: 'ORG_CONTEXT_MISMATCH' }, 409),
    );
    await expect(fetchKnowledgeDocuments('org-a', {})).rejects.toMatchObject({
      status: 409,
      code: 'ORG_CONTEXT_MISMATCH',
    });
  });
});

describe('malformed list responses (F-S7)', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it.each([[{}], [{ documents: null }], [{ documents: 'x' }], [null]])(
    'rejects %j as an invalid response instead of returning undefined documents',
    async (payload) => {
      vi.stubGlobal('fetch', fetchMock);
      fetchMock.mockImplementation(() => ok(payload));
      await expect(fetchKnowledgeDocuments('org-a', {})).rejects.toMatchObject({
        status: 502,
        code: 'INVALID_RESPONSE',
      });
    },
  );
});
