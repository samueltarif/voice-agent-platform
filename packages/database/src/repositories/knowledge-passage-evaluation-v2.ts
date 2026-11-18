import type {
  KnowledgeCommercialAspect,
  KnowledgeHitRelevance,
  KnowledgeRetrievalHit,
} from '@voice-agent/contracts';
import type { ChunkRow } from './knowledge-retrieval-v2-queries.js';
import {
  buildPassageCandidates,
  type PassageCandidate as Candidate,
} from './knowledge-passage-candidates.js';
import {
  compileTerms,
  countTerm,
  termPositions,
  type CompiledTerm,
} from './knowledge-term-matcher-v2.js';
import {
  askedAspectTerms,
  classifyPassageV2,
  DIRECT_MIN_RELATIVE_SCORE,
  MAX_CONTEXT_PASSAGES,
  planTermsV2,
  type PassageMatch,
  type TermStats,
} from './knowledge-evidence-classifier-v2.js';
import { normalizeScores, rawPassageScore } from './knowledge-passage-ranking.js';
import { aspectsNotFound } from './knowledge-commercial-evidence.js';
import { toKnowledgeRetrievalHit } from './knowledge-retrieval-hit.js';
import { KNOWLEDGE_GENERIC_TERMS } from './knowledge-term-relevance.js';

export interface EvaluateV2Input {
  readonly rows: readonly ChunkRow[];
  readonly words: readonly string[];
  readonly codes: readonly string[];
  readonly aspects: readonly KnowledgeCommercialAspect[];
  readonly organizationNameTerms: ReadonlySet<string>;
  readonly scope: {
    readonly total: number;
    readonly words: readonly number[];
    readonly codes: readonly number[];
  };
}

function termStats(
  input: EvaluateV2Input,
  terms: readonly CompiledTerm[],
  cands: readonly Candidate[],
): TermStats[] {
  const scopeDf = [...input.scope.codes, ...input.scope.words];
  return terms.map((t, i) => {
    const df = Math.max(1, scopeDf[i] ?? 0);
    // Sem regra de ubiquidade na v2: o nome da empresa é tratado à parte e o
    // IDF já reduz o peso de palavras frequentes (a palavra pedida não some).
    const central =
      t.isCode ||
      (!KNOWLEDGE_GENERIC_TERMS.has(t.term) && !input.organizationNameTerms.has(t.term));
    const passageFrequency = cands.filter(
      (c) => countTerm(c.foldedText, t) > 0 || countTerm(c.foldedHeading, t) > 0,
    ).length;
    return { term: t.term, central, idf: Math.log(1 + input.scope.total / df), passageFrequency };
  });
}

function matchOf(c: Candidate, terms: readonly CompiledTerm[]): PassageMatch {
  return {
    inText: terms.map((t) => countTerm(c.foldedText, t)),
    inHeading: terms.map((t) => countTerm(c.foldedHeading, t) > 0),
  };
}

interface Scored {
  readonly c: Candidate;
  readonly relevance: KnowledgeHitRelevance;
  readonly raw: number;
}

function select(scored: readonly Scored[]): Scored[] {
  const byScore = (a: Scored, b: Scored) =>
    b.raw - a.raw ||
    a.c.row.doc.id.localeCompare(b.c.row.doc.id) ||
    a.c.text.localeCompare(b.c.text);
  const direct = scored.filter((s) => s.relevance === 'DIRECT').sort(byScore);
  const best = direct[0]?.raw ?? 0;
  const kept = direct.filter((s) => s.raw >= best * DIRECT_MIN_RELATIVE_SCORE);
  const context =
    kept.length > 0
      ? scored
          .filter((s) => s.relevance === 'CONTEXT')
          .sort(byScore)
          .slice(0, MAX_CONTEXT_PASSAGES)
      : [];
  return [...kept, ...context];
}

function toHit(s: Scored, score: number): KnowledgeRetrievalHit {
  const base = toKnowledgeRetrievalHit({
    chunk: s.c.row.chunk,
    doc: s.c.row.doc,
    score,
    relevance: s.relevance,
  });
  const passage = {
    heading: s.c.heading,
    firstChunkOrdinal: s.c.row.chunk.ordinal,
    lastChunkOrdinal: s.c.lastOrdinal,
  };
  return { ...base, textSnapshot: s.c.text, passage };
}

/** Passagens → resultados v2 (pura, determinística; sem acesso ao banco). */
export function evaluatePassagesV2(input: EvaluateV2Input) {
  const terms = compileTerms(input.words, input.codes);
  const cands = buildPassageCandidates(input.rows);
  const stats = termStats(input, terms, cands);
  const plan = planTermsV2(stats, new Set(input.codes));
  const asked = askedAspectTerms(input.aspects);
  const avg = cands.reduce((n, c) => n + c.text.length, 0) / Math.max(1, cands.length);
  const scored: Scored[] = [];
  for (const c of cands) {
    const match = matchOf(c, terms);
    const relevance = classifyPassageV2({ match, plan, stats, askedAspectTerms: asked });
    if (!relevance) continue;
    const centralPositions = terms.map((t, i) =>
      stats[i]!.central ? termPositions(c.foldedText, t) : [],
    );
    const inTitle = terms.map((t) => countTerm(c.foldedTitle, t) > 0);
    scored.push({
      c,
      relevance,
      raw: rawPassageScore({ match, inTitle, length: c.text.length, centralPositions }, stats, avg),
    });
  }
  const chosen = select(scored);
  const scores = normalizeScores(chosen.map((s) => s.raw));
  const direct = chosen
    .filter((s) => s.relevance === 'DIRECT')
    .map((s) => ({ foldedText: s.c.foldedText, foldedHeading: s.c.foldedHeading }));
  return {
    hits: chosen.map((s, i) => toHit(s, scores[i]!)),
    unmatchedTerms: plan.unmatched,
    aspectsNotFound: aspectsNotFound(input.aspects, direct),
  };
}
