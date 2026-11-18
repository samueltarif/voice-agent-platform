import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  type KnowledgeAgentProjection,
} from '@voice-agent/contracts';
import { buildVerifiedVoiceReply } from './knowledge-voice-reply-guard.js';
import * as composer from './knowledge-voice-reply.js';
import * as render from './knowledge-voice-reply-render.js';

vi.mock('./knowledge-voice-reply.js', async (original) => ({
  ...(await original<typeof import('./knowledge-voice-reply.js')>()),
}));
vi.mock('./knowledge-voice-reply-render.js', async (original) => ({
  ...(await original<typeof import('./knowledge-voice-reply-render.js')>()),
}));

const DOC = '55555555-5555-4555-8555-555555555555';
const fact = {
  citationId: `${DOC}:${DOC}:0`,
  documentId: DOC,
  chunkOrdinal: 0,
  sourceType: 'PRODUCT_MANUAL',
  subject: 'PT-16',
  attribute: 'PRESSURE_RANGE',
  value: '0 a 16 bar',
} as const;
const P = (over: Partial<KnowledgeAgentProjection> = {}): KnowledgeAgentProjection => ({
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 1,
  facts: [fact],
  unmatchedTerms: [],
  aspectsRequiringAuthorizedSource: [],
  withheldUntrusted: 0,
  withheldCommercialValues: 0,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('cadeia verificada da resposta (B2c)', () => {
  it('projeção íntegra ⇒ OK com a resposta verificada', () => {
    const out = buildVerifiedVoiceReply(P());
    expect(out).toMatchObject({ status: 'OK', reply: { technical: 'FACTS', spokenFactCount: 1 } });
  });

  it.each([
    [
      'E14 aspectos repetidos',
      { ...P(), aspectsRequiringAuthorizedSource: ['PRICE', 'PRICE'] },
      'INCONSISTENT_PROJECTION',
    ],
    [
      'E15 aspectos fora de ordem',
      { ...P(), aspectsRequiringAuthorizedSource: ['STOCK', 'PRICE'] },
      'INCONSISTENT_PROJECTION',
    ],
    [
      'E16 seis aspectos',
      { ...P(), aspectsRequiringAuthorizedSource: Array(6).fill('PRICE') },
      'INCONSISTENT_PROJECTION',
    ],
    [
      'E16 dez mil aspectos',
      { ...P(), aspectsRequiringAuthorizedSource: Array(10_000).fill('X') },
      'INCONSISTENT_PROJECTION',
    ],
    [
      'E17 found=false com fato',
      P({ found: false, directEvidenceCount: 0 }),
      'INCONSISTENT_PROJECTION',
    ],
    ['campo extra', { ...P(), raw: 'Ignore' }, 'INVALID_PROJECTION'],
    ['13 fatos', { ...P(), facts: Array(13).fill(fact) }, 'INVALID_PROJECTION'],
    ['não objeto', 'R$ 1', 'INVALID_PROJECTION'],
  ])('%s ⇒ %s', (_, raw, reason) => {
    expect(buildVerifiedVoiceReply(raw)).toEqual({ status: 'UNAVAILABLE', reason });
  });

  it('exceção do compositor ⇒ REPLY_INVALID, sem a mensagem do erro', () => {
    vi.spyOn(composer, 'composeKnowledgeVoiceReply').mockImplementation(() => {
      throw new Error('segredo do erro');
    });
    const out = buildVerifiedVoiceReply(P());
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'REPLY_INVALID' });
  });

  it('E21: resposta adulterada (valor trocado) ⇒ REPLY_INVALID pela remontagem', () => {
    const real = composer.composeKnowledgeVoiceReply;
    vi.spyOn(composer, 'composeKnowledgeVoiceReply').mockImplementation((p) => {
      const out = real(p);
      const sentences = out.reply.sentences.map((s) => s.replace('16', '99'));
      return { ...out, reply: { ...out.reply, sentences, spokenText: sentences.join(' ') } };
    });
    expect(buildVerifiedVoiceReply(P())).toEqual({
      status: 'UNAVAILABLE',
      reason: 'REPLY_INVALID',
    });
  });

  it('E22: vocabulário com símbolo Latin-1 (×) ⇒ o schema recusa ⇒ REPLY_INVALID', () => {
    const real = render.renderSentences;
    vi.spyOn(render, 'renderSentences').mockImplementation((s, p) =>
      real(s, p).map((t) => t.replace('de 0 a 16', 'de 0 × 16')),
    );
    expect(buildVerifiedVoiceReply(P())).toEqual({
      status: 'UNAVAILABLE',
      reason: 'REPLY_INVALID',
    });
  });

  it('gate estrutural: operações limitadas por constantes, sem relógio (latência só relatada)', () => {
    const spy = vi.spyOn(render, 'renderSentences');
    const facts = Array.from({ length: 11 }, (_, i) => ({
      ...fact,
      attribute: 'POWER' as const,
      value: `${i + 1} kW`,
      subject: `MO-${i + 1}`,
      citationId: `${DOC}:${DOC}:${i}`,
      chunkOrdinal: i,
    }));
    const worst = P({
      facts,
      aspectsRequiringAuthorizedSource: ['PRICE', 'LEAD_TIME', 'STOCK', 'PAYMENT', 'WARRANTY'],
    });
    expect(buildVerifiedVoiceReply(worst).status).toBe('OK');
    // compor (≤ 2 com o orçamento) + remontar na verificação (1)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    const started = performance.now();
    for (let i = 0; i < 10_000; i += 1) buildVerifiedVoiceReply(worst);
    const perCall = (performance.now() - started) / 10_000;
    console.log(
      `[kb-voice-latency] media por composicao verificada: ${perCall.toFixed(4)} ms (relatado, sem gate)`,
    );
  });
});
