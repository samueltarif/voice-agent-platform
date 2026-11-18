import {
  KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS,
  KNOWLEDGE_AGENT_PROJECTION_USAGE,
  KNOWLEDGE_COMMERCIAL_ASPECTS,
  knowledgeAgentProjectionSchema,
  type KnowledgeAgentProjection,
  type KnowledgeCommercialAspect,
  type KnowledgeSourceType,
  type KnowledgeTechnicalFact,
} from '@voice-agent/contracts';
import { isAspectInformed } from './knowledge-commercial-evidence.js';
import { extractTechnicalFacts, findPassageSubject } from './knowledge-technical-fact-extractor.js';

/** Passagem DIRECT e confiável (já sem conteúdo suspeito), na ordem do ranking. */
export interface ProjectionPassage {
  readonly citationId: string;
  readonly documentId: string;
  readonly chunkOrdinal: number;
  readonly sourceType: KnowledgeSourceType;
  readonly text: string;
  readonly foldedText: string;
  readonly foldedHeading: string;
}

export interface AgentProjectionInput {
  readonly direct: readonly ProjectionPassage[];
  readonly codes: readonly string[];
  readonly aspects: readonly KnowledgeCommercialAspect[];
  readonly unmatchedTerms: readonly string[];
  readonly withheldUntrusted: number;
  readonly truncated: boolean;
}

function factsOf(p: ProjectionPassage, codes: readonly string[]): KnowledgeTechnicalFact[] {
  const subject = findPassageSubject(p.text, codes);
  return extractTechnicalFacts(p.text).map((f) => ({
    citationId: p.citationId,
    documentId: p.documentId,
    chunkOrdinal: p.chunkOrdinal,
    sourceType: p.sourceType,
    subject,
    attribute: f.attribute,
    value: f.value,
  }));
}

const hasCommercialValue = (p: ProjectionPassage) =>
  KNOWLEDGE_COMMERCIAL_ASPECTS.some((aspect) => isAspectInformed(aspect, p));

/**
 * O que o AGENTE receberia da busca v2 (B2b, DEC-069): só fatos técnicos com
 * fonte, contagens e aspectos que exigem fonte autorizada. Nenhum texto de
 * documento passa por aqui; o schema estrito valida a saída (erro = defeito,
 * nunca projeção parcial).
 */
export function buildAgentProjectionV2(input: AgentProjectionInput): KnowledgeAgentProjection {
  const unique = new Map<string, KnowledgeTechnicalFact>();
  for (const p of input.direct) {
    for (const f of factsOf(p, input.codes)) {
      const key = `${f.subject}|${f.attribute}|${f.value}`;
      if (!unique.has(key)) unique.set(key, f);
    }
  }
  return knowledgeAgentProjectionSchema.parse({
    trust: 'UNTRUSTED_DATA',
    retrievalProfile: 'v2',
    found: input.direct.length > 0,
    directEvidenceCount: input.direct.length,
    facts: [...unique.values()].slice(0, KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS),
    unmatchedTerms: input.unmatchedTerms.filter((t) => /^[a-z0-9]{1,64}$/.test(t)).slice(0, 16),
    aspectsRequiringAuthorizedSource: [...input.aspects],
    withheldUntrusted: input.withheldUntrusted,
    withheldCommercialValues: input.direct.filter(hasCommercialValue).length,
    truncated: input.truncated,
    usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
  });
}
