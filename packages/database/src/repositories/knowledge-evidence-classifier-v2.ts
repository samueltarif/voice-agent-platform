import type { KnowledgeCommercialAspect, KnowledgeHitRelevance } from '@voice-agent/contracts';
import { KNOWLEDGE_ASPECT_TERMS } from './knowledge-query-analysis-v2.js';

/**
 * Classificação DIRECT × CONTEXT da busca v2 (DEC-067, D-RB4 — hipóteses
 * iniciais medidas no corpus; mudar limiar exige nova decisão).
 * - CENTRAL: código ou palavra que não é genérica, ubíqua nem do nome da empresa.
 * - ÂNCORAS: todos os códigos encontrados; sem código, a palavra central
 *   encontrada mais específica (maior IDF; empates contam todas).
 * - DIRECT: passagem (texto + título da seção) com TODAS as âncoras, cobrindo
 *   ≥ `DIRECT_MIN_COVERAGE` do peso das centrais encontradas, e cujo próprio
 *   texto menciona algum termo da pergunta (o título sozinho não basta).
 * - CONTEXT: passagem sem central que trata de um aspecto comercial PEDIDO;
 *   no máximo 1, e só se houver DIRECT.
 * - Demais passagens são descartadas (nem evidência, nem contexto).
 */
export const DIRECT_MIN_COVERAGE = 0.5;
export const DIRECT_MIN_RELATIVE_SCORE = 0.35;
export const MAX_CONTEXT_PASSAGES = 1;

export interface TermStats {
  readonly term: string;
  readonly central: boolean;
  readonly idf: number;
  /** Passagens candidatas que contêm o termo (casamento exato da v2). */
  readonly passageFrequency: number;
}

export interface PassageMatch {
  /** Ocorrências de cada termo (mesma ordem de `TermStats`) no texto da passagem. */
  readonly inText: readonly number[];
  /** O termo aparece no título da seção. */
  readonly inHeading: readonly boolean[];
}

export interface TermPlanV2 {
  readonly matchedCentral: readonly number[];
  readonly anchors: readonly number[];
  readonly unmatched: readonly string[];
}

export function planTermsV2(stats: readonly TermStats[], codes: ReadonlySet<string>): TermPlanV2 {
  const central = stats.map((s, i) => ({ s, i })).filter(({ s }) => s.central);
  const matched = central.filter(({ s }) => s.passageFrequency > 0);
  const unmatched = central.filter(({ s }) => s.passageFrequency === 0).map(({ s }) => s.term);
  const codeAnchors = matched.filter(({ s }) => codes.has(s.term)).map(({ i }) => i);
  const best = Math.max(...matched.map(({ s }) => s.idf), 0);
  const wordAnchors = matched.filter(({ s }) => s.idf === best).map(({ i }) => i);
  return {
    matchedCentral: matched.map(({ i }) => i),
    anchors: codeAnchors.length > 0 ? codeAnchors : wordAnchors,
    unmatched,
  };
}

const present = (m: PassageMatch, i: number) => (m.inText[i] ?? 0) > 0 || (m.inHeading[i] ?? false);

function coverage(m: PassageMatch, plan: TermPlanV2, stats: readonly TermStats[]): number {
  const total = plan.matchedCentral.reduce((sum, i) => sum + stats[i]!.idf, 0);
  const hit = plan.matchedCentral.filter((i) => present(m, i));
  return total === 0 ? 0 : hit.reduce((sum, i) => sum + stats[i]!.idf, 0) / total;
}

function asksAspect(m: PassageMatch, stats: readonly TermStats[], asked: ReadonlySet<string>) {
  return stats.some((s, i) => asked.has(s.term) && present(m, i));
}

/** Relevância de uma passagem, ou `null` para descartar. */
export function classifyPassageV2(input: {
  readonly match: PassageMatch;
  readonly plan: TermPlanV2;
  readonly stats: readonly TermStats[];
  readonly askedAspectTerms: ReadonlySet<string>;
}): KnowledgeHitRelevance | null {
  const { match, plan, stats, askedAspectTerms } = input;
  const anyCentral = stats.some((s) => s.central);
  if (!anyCentral) return stats.some((_, i) => present(match, i)) ? 'DIRECT' : null;
  if (plan.matchedCentral.length === 0) return null;
  const centralHere = plan.matchedCentral.some((i) => present(match, i));
  if (!centralHere) return asksAspect(match, stats, askedAspectTerms) ? 'CONTEXT' : null;
  return isDirect(match, plan, stats) ? 'DIRECT' : null;
}

function isDirect(m: PassageMatch, plan: TermPlanV2, stats: readonly TermStats[]): boolean {
  const textMentions = stats.some((_, i) => (m.inText[i] ?? 0) > 0);
  const anchored = plan.anchors.every((i) => present(m, i));
  return anchored && textMentions && coverage(m, plan, stats) >= DIRECT_MIN_COVERAGE;
}

export function askedAspectTerms(aspects: readonly KnowledgeCommercialAspect[]): Set<string> {
  return new Set(aspects.flatMap((aspect) => KNOWLEDGE_ASPECT_TERMS[aspect]));
}
