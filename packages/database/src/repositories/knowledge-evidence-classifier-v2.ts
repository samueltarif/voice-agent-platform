import type { KnowledgeCommercialAspect, KnowledgeHitRelevance } from '@voice-agent/contracts';
import { KNOWLEDGE_ASPECT_TERMS } from './knowledge-query-analysis-v2.js';

/**
 * Classificação DIRECT × CONTEXT da busca v2 (DEC-067; D-RB4 = hipóteses
 * iniciais medidas no corpus; cada mudança é registrada na DEC).
 * - CENTRAL: código ou palavra que não é genérica nem do nome da empresa.
 * - CÓDIGO: identifica o produto exatamente. Pergunta com código só tem
 *   evidência se ALGUM código pedido existe no escopo; código inexistente nunca
 *   é trocado por produto parecido. Âncoras = códigos encontrados.
 * - SEM CÓDIGO: âncora = a PRIMEIRA palavra central da pergunta (núcleo do
 *   sintagma em português: "transmissores de pressão", "motor a diesel"). Se o
 *   núcleo não aparece em nenhum documento, não há evidência.
 * - DIRECT: passagem (texto + título da seção) com TODAS as âncoras, cujo
 *   próprio texto menciona algum termo da pergunta (o título sozinho não basta)
 *   e que cobre MAIS que `DIRECT_MIN_COVERAGE` (maioria estrita) do peso das centrais. Sem código, o
 *   peso inclui as centrais AUSENTES de todo o escopo ("medidor ultrassônico":
 *   a pergunta é sobre algo que os documentos não têm).
 * - CONTEXT: passagem sem central que trata de um aspecto comercial PEDIDO;
 *   no máximo 1, e só se houver DIRECT.
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
  /** Centrais que entram no peso da cobertura (inclui ausentes, sem código). */
  readonly coverageTerms: readonly number[];
  readonly unmatched: readonly string[];
  /** Nenhuma passagem pode ser evidência (código ou núcleo inexistente). */
  readonly blocked: boolean;
}

export function planTermsV2(stats: readonly TermStats[], codes: ReadonlySet<string>): TermPlanV2 {
  const central = stats.map((s, i) => ({ s, i })).filter(({ s }) => s.central);
  const matched = central.filter(({ s }) => s.passageFrequency > 0).map(({ i }) => i);
  const unmatched = central.filter(({ s }) => s.passageFrequency === 0).map(({ s }) => s.term);
  const asked = central.filter(({ s }) => codes.has(s.term)).map(({ i }) => i);
  if (asked.length > 0) {
    const found = asked.filter((i) => matched.includes(i));
    const plan = { matchedCentral: matched, anchors: found, coverageTerms: matched, unmatched };
    return { ...plan, blocked: found.length === 0 };
  }
  const head = central[0]?.i;
  const headFound = head !== undefined && matched.includes(head);
  return {
    matchedCentral: matched,
    anchors: headFound ? [head] : [],
    coverageTerms: central.map(({ i }) => i),
    unmatched,
    blocked: head !== undefined && !headFound,
  };
}

const present = (m: PassageMatch, i: number) => (m.inText[i] ?? 0) > 0 || (m.inHeading[i] ?? false);

function coverage(m: PassageMatch, plan: TermPlanV2, stats: readonly TermStats[]): number {
  const total = plan.coverageTerms.reduce((sum, i) => sum + stats[i]!.idf, 0);
  const hit = plan.coverageTerms.filter((i) => present(m, i));
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
  if (plan.blocked || plan.matchedCentral.length === 0) return null;
  const centralHere = plan.matchedCentral.some((i) => present(match, i));
  if (!centralHere) return asksAspect(match, stats, askedAspectTerms) ? 'CONTEXT' : null;
  return isDirect(match, plan, stats) ? 'DIRECT' : null;
}

function isDirect(m: PassageMatch, plan: TermPlanV2, stats: readonly TermStats[]): boolean {
  const textMentions = stats.some((_, i) => (m.inText[i] ?? 0) > 0);
  const anchored = plan.anchors.every((i) => present(m, i));
  return anchored && textMentions && coverage(m, plan, stats) > DIRECT_MIN_COVERAGE;
}

export function askedAspectTerms(aspects: readonly KnowledgeCommercialAspect[]): Set<string> {
  return new Set(aspects.flatMap((aspect) => KNOWLEDGE_ASPECT_TERMS[aspect]));
}
