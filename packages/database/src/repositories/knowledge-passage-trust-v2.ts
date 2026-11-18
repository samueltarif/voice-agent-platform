import type { KnowledgeRetrievalHit } from '@voice-agent/contracts';
import type { PassageCandidate } from './knowledge-passage-candidates.js';
import { countTerm, type CompiledTerm } from './knowledge-term-matcher-v2.js';
import type { TermStats } from './knowledge-evidence-classifier-v2.js';
import { toKnowledgeRetrievalHit } from './knowledge-retrieval-hit.js';
import { detectHostileContent, type HostileSignal } from './knowledge-hostile-content-detector.js';

/**
 * Confiança das passagens da v2 (B2b, DEC-069): passagem com sinal do detector
 * auxiliar sai de TODA a avaliação (não entra em estatística, ranking,
 * evidência, aspectos nem projeção do agente). Só a visão administrativa a vê.
 */
export interface SuspiciousCandidate {
  readonly c: PassageCandidate;
  readonly signals: readonly HostileSignal[];
}

export function splitByTrust(cands: readonly PassageCandidate[]) {
  const trusted: PassageCandidate[] = [];
  const suspicious: SuspiciousCandidate[] = [];
  for (const c of cands) {
    const signals = detectHostileContent(`${c.heading ?? ''}\n${c.text}`);
    if (signals.length > 0) suspicious.push({ c, signals });
    else trusted.push(c);
  }
  return { trusted, suspicious };
}

/** Suspeita relevante = menciona algum termo central da pergunta (ou qualquer termo, sem centrais). */
export function relevantSuspicious(
  suspicious: readonly SuspiciousCandidate[],
  terms: readonly CompiledTerm[],
  stats: readonly TermStats[],
): SuspiciousCandidate[] {
  const anyCentral = stats.some((s) => s.central);
  const wanted = terms.filter((_, i) => !anyCentral || stats[i]!.central);
  return suspicious.filter(({ c }) =>
    wanted.some((t) => countTerm(c.foldedText, t) > 0 || countTerm(c.foldedHeading, t) > 0),
  );
}

export interface SuspiciousPassageHit {
  readonly hit: KnowledgeRetrievalHit;
  readonly signals: readonly HostileSignal[];
}

/** Só para a visão administrativa: nunca é evidência (sem relevância, pontuação 0). */
export function toSuspiciousHit({ c, signals }: SuspiciousCandidate): SuspiciousPassageHit {
  const base = toKnowledgeRetrievalHit({
    chunk: c.row.chunk,
    doc: c.row.doc,
    score: 0,
    relevance: 'CONTEXT',
  });
  const passage = {
    heading: c.heading,
    firstChunkOrdinal: c.row.chunk.ordinal,
    lastChunkOrdinal: c.lastOrdinal,
  };
  return { hit: { ...base, relevance: undefined, textSnapshot: c.text, passage }, signals };
}
