import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { compareKnowledgeRetrieval } from './knowledge-retrieval-comparison-client';

const fetchMock = vi.fn();

describe('compareKnowledgeRetrieval', () => {
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('posts the question with the displayed organization and returns the comparison', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ comparison: { hits: [] } })));
    await expect(compareKnowledgeRetrieval('org-a', { queryText: 'q' })).resolves.toEqual({
      hits: [],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/knowledge/retrieval-comparison');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-knowledge-org-slug']).toBe('org-a');
    expect(JSON.parse(init.body as string)).toEqual({ queryText: 'q' });
  });

  it('raises the safe server error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Sem permissão.', code: 'FORBIDDEN' }), { status: 403 }),
    );
    await expect(compareKnowledgeRetrieval('org-a', { queryText: 'q' })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
