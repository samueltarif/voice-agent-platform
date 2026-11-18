import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestKnowledgeDocument } from '@voice-agent/database';
import {
  createDisposableTestDatabase,
  createKnowledgeSimulationFixture,
  EVALUATION_DOCUMENTS,
  EVALUATION_QUESTIONS,
  type KnowledgeSimulationFixture,
} from '@voice-agent/database/test-support';
import {
  createKnowledgeSimulatedTurnService,
  type KnowledgeSimulatedTurnPort,
} from '../simulation/knowledge-simulated-turn-service.js';
import { V1_TURN_CHARACTERIZATION } from './fixtures/knowledge-simulated-turn-v1-characterization.expected.js';

const tdb = await createDisposableTestDatabase('knowledge-simulated-turn-v1-characterization');

/**
 * PR B1 (DEC-067) — o turno de um agente PUBLICADO (como o Qualitec v4, sem
 * perfil de busca) continua idêntico: mesma resposta, evidências e termos
 * ausentes para todo o corpus. Criado antes de mudar o fluxo compartilhado.
 */
describe('Simulated knowledge turn of a published agent — v1 characterization', () => {
  let fx: KnowledgeSimulationFixture;
  let service: KnowledgeSimulatedTurnPort;

  beforeAll(async () => {
    fx = await createKnowledgeSimulationFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    for (const doc of EVALUATION_DOCUMENTS) {
      await ingestKnowledgeDocument(tdb.db, {
        organizationId: doc.org === 'A' ? fx.orgA : fx.orgB,
        title: doc.title,
        source: { sourceType: 'PRODUCT_MANUAL', locator: `eval/${doc.key}` },
        rawText: doc.text,
      });
    }
    service = createKnowledgeSimulatedTurnService(tdb.db);
  }, 180_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  it.each(EVALUATION_QUESTIONS.map((q) => [q.id, q] as const))(
    '%s: identical reply',
    async (id, question) => {
      const a = question.org === 'A';
      const { turn } = await service.run({
        organizationId: a ? fx.orgA : fx.orgB,
        agentId: a ? fx.sales : fx.salesB,
        utterance: question.query,
      });
      // Linhas fixas da resposta (sem as citações "[n]"): entre trechos EMPATADOS no
      // corte de 3 resultados a v1 usa o ID aleatório do trecho, então o conteúdo das
      // citações é verificado na caracterização da busca (sem corte), não aqui.
      const fixed = turn.replyText.split('\n').filter((line) => !/^\[\d+\] /.test(line));
      const reply = createHash('sha256').update(fixed.join('\n')).digest('hex').slice(0, 16);
      const projected = `${turn.outcome}|${reply}|${turn.evidence.length}|${turn.unmatchedTerms.join(',')}`;
      expect(projected).toBe(V1_TURN_CHARACTERIZATION[id]);
    },
  );
});
