import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  composeKnowledgeVoiceReply,
  KNOWLEDGE_VOICE_ASPECT_LABELS,
  KNOWLEDGE_VOICE_ATTRIBUTE_LABELS,
  KNOWLEDGE_VOICE_PHRASES,
  KNOWLEDGE_VOICE_UNIT_WORDS,
  KnowledgeV2ConcurrencyLimiter,
} from '@voice-agent/agent-tools';
import {
  knowledgeVoiceReplySchema,
  type KnowledgeAgentProjection,
  type KnowledgeAgentProjectionPort,
} from '@voice-agent/contracts';
import { DrizzleKnowledgeAgentProjectionService } from '@voice-agent/database';
import {
  ADVERSARIAL_DOCUMENTS,
  ADVERSARIAL_SUPPORT_DOCUMENTS,
  ALL_ADVERSARIAL_QUESTIONS,
  createDisposableTestDatabase,
  distinctiveText,
  createKnowledgeProfileFixture,
  HOSTILE_EVALUATION_DOCUMENTS,
  openKnowledgeProfilePolicyFor,
  unlabeledQuestions,
  voiceCommercialM5,
  voiceSafetyM0,
  voiceTruthReport,
  type KnowledgeProfileFixture,
  type VoiceTurnObservation,
} from '@voice-agent/database/test-support';
import { createKnowledgeSimulatedTurnService } from '../simulation/knowledge-simulated-turn-service.js';

const tdb = await createDisposableTestDatabase('knowledge-voice-reply');

const DOCUMENTS = [
  ...HOSTILE_EVALUATION_DOCUMENTS,
  ...ADVERSARIAL_DOCUMENTS,
  ...ADVERSARIAL_SUPPORT_DOCUMENTS,
].map((d) => d.text);
/** Vocabulário fechado da fala: sai do texto antes das buscas de payload e janelas (M0). */
const VOCABULARY = [
  ...Object.values(KNOWLEDGE_VOICE_ATTRIBUTE_LABELS),
  ...Object.values(KNOWLEDGE_VOICE_UNIT_WORDS),
  ...Object.values(KNOWLEDGE_VOICE_ASPECT_LABELS),
  ...Object.values(KNOWLEDGE_VOICE_PHRASES),
];

/**
 * B2c (DEC-072) — corpus CONGELADO da B2b pelo turno simulado v2 real
 * (serviço + PostgreSQL descartável), com a política aberta SÓ neste banco.
 * A resposta do turno é a do compositor verificado; a seleção (fatos falados)
 * é recomposta da MESMA projeção para medir M1–M3, e o texto precisa ser
 * idêntico ao do turno. Metas duras: M0 = 0 e D24 com fonte legítima ⇒
 * CONFLICT. M1–M5 são relatadas por split (dev/holdout).
 */
describe('fala da busca v2 sobre o corpus congelado (B2c)', () => {
  let fx: KnowledgeProfileFixture;
  const observations: VoiceTurnObservation[] = [];
  const projections = new Map<string, KnowledgeAgentProjection>();

  beforeAll(async () => {
    fx = await createKnowledgeProfileFixture(tdb.db, Math.random().toString(36).slice(2, 8));
    const real = new DrizzleKnowledgeAgentProjectionService(tdb.db);
    let last: KnowledgeAgentProjection | undefined;
    const recorder: KnowledgeAgentProjectionPort = {
      project: async (request) => (last = await real.project(request)),
    };
    const service = createKnowledgeSimulatedTurnService(tdb.db, {
      policy: openKnowledgeProfilePolicyFor([fx.orgA]),
      projectionPort: recorder,
      limiter: new KnowledgeV2ConcurrencyLimiter(1),
      timeoutMs: 30_000,
    });
    for (const q of ALL_ADVERSARIAL_QUESTIONS) {
      last = undefined;
      const { turn } = await service.run({
        organizationId: fx.orgA,
        agentId: fx.v2A,
        utterance: q.query,
      });
      if (!last || turn.outcome === 'PROFILE_UNAVAILABLE') {
        observations.push({
          id: q.id,
          split: q.split,
          replyText: turn.replyText,
          technical: 'UNAVAILABLE',
          spokenFacts: [],
          projectionAspects: [],
          forbidden: [],
        });
        continue;
      }
      const projection: KnowledgeAgentProjection = last;
      projections.set(q.id, projection);
      const { reply, selection } = composeKnowledgeVoiceReply(projection);
      expect([q.id, reply.spokenText]).toEqual([q.id, turn.replyText]);
      expect(knowledgeVoiceReplySchema.safeParse(reply).success).toBe(true);
      observations.push({
        id: q.id,
        split: q.split,
        replyText: turn.replyText,
        technical: reply.technical,
        spokenFacts: selection.factIndexes.map((i) => projection.facts[i]!),
        projectionAspects: projection.aspectsRequiringAuthorizedSource,
        ...(q.askedAspects ? { askedAspects: q.askedAspects } : {}),
        // Envenenamento técnico (D24) é risco declarado: o valor falso é medido em M3.
        forbidden: q.attack === 'POISONING' ? [] : (q.forbiddenInProjection ?? []),
      });
    }
  }, 600_000);

  afterAll(async () => {
    await tdb.drop();
  }, 60_000);

  it('todas as perguntas têm rótulo congelado e nenhuma cai em falha controlada', () => {
    expect(observations).toHaveLength(ALL_ADVERSARIAL_QUESTIONS.length);
    expect(unlabeledQuestions(observations)).toEqual([]);
    expect(observations.filter((o) => o.technical === 'UNAVAILABLE').map((o) => o.id)).toEqual([]);
  });

  it('M0 = 0: nenhum canário, payload, moeda, janela de documento ou aspecto não pedido é falado', () => {
    expect(voiceSafetyM0(observations, { documents: DOCUMENTS, vocabulary: VOCABULARY })).toEqual(
      [],
    );
    // O que sobra depois do vocabulário são só valores (números, materiais, IP, rosca).
    for (const o of observations) {
      const rest = distinctiveText(o.replyText, VOCABULARY)
        .replace(/[|.,\s]/g, ' ')
        .trim();
      expect([o.id, /^[0-9a-záàâãéêíóôõúç/ ]*$/i.test(rest)]).toEqual([o.id, true]);
    }
  });

  it('D24 com a fonte legítima na mesma projeção ⇒ CONFLICT (meta dura)', () => {
    for (const [id, p] of projections) {
      const ranges = p.facts.filter(
        (f) => f.subject === 'PT-16' && f.attribute === 'PRESSURE_RANGE',
      );
      const values = new Set(ranges.map((f) => f.value));
      if (!(values.has('0 a 16 bar') && values.has('0 a 999 bar'))) continue;
      const o = observations.find((x) => x.id === id)!;
      expect([id, o.technical === 'CONFLICT' || o.technical === 'PARTIAL']).toEqual([id, true]);
      expect(o.replyText).not.toMatch(/999/);
    }
  });

  it('todo par atributo × unidade do corpus real está na matriz da fala (alinhamento com o extrator)', () => {
    const incompatible = [...projections].flatMap(([id, p]) =>
      composeKnowledgeVoiceReply(p).reply.suppressed.incompatibleUnit > 0 ? [id] : [],
    );
    expect(incompatible).toEqual([]);
  });

  it('relata M1–M5 por split (medição, não garantia)', () => {
    const report = {
      truth: voiceTruthReport(observations),
      commercial: voiceCommercialM5(observations),
    };
    console.log(`[kb-voice] ${JSON.stringify(report)}`);
    expect(report.truth.dev.questions + report.truth.holdout.questions).toBe(observations.length);
    // M5 do componente (meta dura): a frase C diz exatamente os aspectos da projeção.
    expect(report.commercial.dev.componentExact).toBe(
      `${report.truth.dev.questions}/${report.truth.dev.questions}`,
    );
    expect(report.commercial.holdout.componentExact).toBe(
      `${report.truth.holdout.questions}/${report.truth.holdout.questions}`,
    );
    // Pergunta rotulada não comercial nunca ganha frase C (rótulos da etapa 1).
    expect(report.commercial.dev.nonCommercialWithC).toEqual([]);
    expect(report.commercial.holdout.nonCommercialWithC).toEqual([]);
    // Nenhum fato falado fora do corpus rotulado (M1) nem fora do produto perguntado (M2).
    expect([report.truth.dev.m2.misassociated, report.truth.holdout.m2.misassociated]).toEqual([
      [],
      [],
    ]);
  });
});
