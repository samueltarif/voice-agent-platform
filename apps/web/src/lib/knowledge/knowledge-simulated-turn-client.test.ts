import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSimulatedKnowledgeTurn } from './knowledge-simulated-turn-client';

const AGENT = '33333333-3333-4333-8333-333333333333';
const VALID = {
  agent: { agentId: AGENT, name: 'Vendas', agentVersionId: AGENT, versionNumber: 2 },
  turn: {
    outcome: 'NO_EVIDENCE',
    replyText: 'Não encontrei essa informação nos documentos da empresa.',
    evidence: [],
    unmatchedTerms: [],
  },
};

function respond(status: number, payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('sendSimulatedKnowledgeTurn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts agent and question to the BFF with the screen organization', async () => {
    const fetchMock = respond(200, { simulation: VALID });
    const result = await sendSimulatedKnowledgeTurn('org-a', { agentId: AGENT, utterance: 'x' });
    expect(result).toEqual(VALID);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/knowledge/simulated-turn');
    expect((init.headers as Record<string, string>)['x-knowledge-org-slug']).toBe('org-a');
    expect(JSON.parse(String(init.body))).toEqual({ agentId: AGENT, utterance: 'x' });
  });

  it('never shows a response outside the contract as if it came from the engine', async () => {
    respond(200, { simulation: { ...VALID, turn: { ...VALID.turn, replyText: '' } } });
    await expect(
      sendSimulatedKnowledgeTurn('org-a', { agentId: AGENT, utterance: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    respond(200, { preview: {} });
    await expect(
      sendSimulatedKnowledgeTurn('org-a', { agentId: AGENT, utterance: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('surfaces the BFF error message and status', async () => {
    respond(403, { error: 'Seu papel não permite esta operação.', code: 'FORBIDDEN' });
    await expect(
      sendSimulatedKnowledgeTurn('org-a', { agentId: AGENT, utterance: 'x' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
