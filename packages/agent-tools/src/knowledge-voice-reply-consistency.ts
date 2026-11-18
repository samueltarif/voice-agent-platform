import {
  KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS,
  KNOWLEDGE_COMMERCIAL_ASPECTS,
  KNOWLEDGE_VOICE_REPLY_MAX_ASPECTS,
  type KnowledgeAgentProjection,
  type KnowledgeCommercialAspect,
} from '@voice-agent/contracts';

/**
 * Coerência da projeção ANTES da composição (B2c, DEC-072). Incoerência ou
 * aspectos fora da forma canônica ⇒ falha fechada (`INCONSISTENT_PROJECTION`),
 * nunca "conserto": o único produtor (B2b) já entrega aspectos únicos e na
 * ordem do enum, então outra forma indica defeito ou adulteração.
 */
export type ProjectionPreflight = 'OK' | 'INVALID_PROJECTION' | 'INCONSISTENT_PROJECTION';

/** Teto de `unmatchedTerms` no contrato da projeção (B2b). */
const MAX_UNMATCHED_TERMS = 16;

const tooLong = (value: unknown, max: number) => Array.isArray(value) && value.length > max;

/**
 * Pré-checagem RASA, antes do `safeParse` profundo: arrays acima do teto são
 * recusados só pelo comprimento, sem percorrer itens. Necessária porque
 * `aspectsRequiringAuthorizedSource` não tem `.max` no contrato da B2b (que
 * esta fase não altera) e o Zod percorre todos os itens mesmo quando o
 * comprimento já reprova. O resto da forma fica com o `safeParse`.
 */
export function preflightProjectionShape(raw: unknown): ProjectionPreflight {
  if (typeof raw !== 'object' || raw === null) return 'OK';
  const value = raw as Record<string, unknown>;
  if (tooLong(value.aspectsRequiringAuthorizedSource, KNOWLEDGE_VOICE_REPLY_MAX_ASPECTS)) {
    return 'INCONSISTENT_PROJECTION';
  }
  const oversized =
    tooLong(value.facts, KNOWLEDGE_AGENT_PROJECTION_MAX_FACTS) ||
    tooLong(value.unmatchedTerms, MAX_UNMATCHED_TERMS);
  return oversized ? 'INVALID_PROJECTION' : 'OK';
}

/** Aspectos: comprimento primeiro (O(1)); depois únicos e na ordem canônica do enum. */
export function areAspectsCanonical(aspects: readonly KnowledgeCommercialAspect[]): boolean {
  if (aspects.length > KNOWLEDGE_VOICE_REPLY_MAX_ASPECTS) return false;
  const positions = aspects.map((a) => KNOWLEDGE_COMMERCIAL_ASPECTS.indexOf(a));
  return positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!));
}

function isEvidenceCoherent(p: KnowledgeAgentProjection): boolean {
  if (p.found) return p.directEvidenceCount > 0;
  return p.facts.length === 0 && p.directEvidenceCount === 0 && p.withheldCommercialValues === 0;
}

/** Mesma citação = mesmo documento, posição e tipo; o id começa pelo documento. */
function areCitationsCoherent(p: KnowledgeAgentProjection): boolean {
  const seen = new Map<string, string>();
  for (const f of p.facts) {
    const [documentId, , ordinal] = f.citationId.split(':');
    if (documentId !== f.documentId || Number(ordinal) !== f.chunkOrdinal) return false;
    const identity = `${f.documentId}|${f.chunkOrdinal}|${f.sourceType}`;
    if ((seen.get(f.citationId) ?? identity) !== identity) return false;
    seen.set(f.citationId, identity);
  }
  return true;
}

export function isProjectionConsistent(p: KnowledgeAgentProjection): boolean {
  return (
    areAspectsCanonical(p.aspectsRequiringAuthorizedSource) &&
    isEvidenceCoherent(p) &&
    areCitationsCoherent(p)
  );
}
