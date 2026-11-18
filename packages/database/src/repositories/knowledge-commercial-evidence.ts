import type { KnowledgeCommercialAspect } from '@voice-agent/contracts';
import { KNOWLEDGE_ASPECT_TERMS } from './knowledge-query-analysis-v2.js';

/**
 * D-RB5 (DEC-067): um aspecto comercial pedido (preço, prazo, estoque,
 * pagamento, garantia) só conta como INFORMADO quando uma evidência DIRECT
 * traz o termo do aspecto (no texto ou no título da seção/tabela) E um valor
 * explícito no texto. Sem isso, o aspecto vai em `aspectsNotFound`.
 * Textos já normalizados (`foldKnowledgeText`).
 */
const VALUE_PATTERNS: Readonly<Record<KnowledgeCommercialAspect, RegExp>> = {
  PRICE: /(r\$|us\$|€)\s?\d|\d[\d.,]*\s?(reais|dolares)/,
  LEAD_TIME: /\d+\s?(dias?|semanas?|horas?|mes(es)?)\b/,
  STOCK: /\bem estoque\b|\bindisponive|\b\d+\s?(unidades|pecas)\b/,
  PAYMENT: /\d+\s?(parcelas?|dias|x\b|%)/,
  WARRANTY: /\d+\s?(meses|anos?)\b/,
};

const ASPECT_WORDS: Readonly<Record<KnowledgeCommercialAspect, RegExp>> = Object.fromEntries(
  (Object.keys(KNOWLEDGE_ASPECT_TERMS) as KnowledgeCommercialAspect[]).map((aspect) => [
    aspect,
    new RegExp(`(?<![\\p{L}\\p{N}])(${KNOWLEDGE_ASPECT_TERMS[aspect].join('|')})`, 'u'),
  ]),
) as Record<KnowledgeCommercialAspect, RegExp>;

export interface DirectEvidenceText {
  readonly foldedText: string;
  readonly foldedHeading: string;
}

export function isAspectInformed(
  aspect: KnowledgeCommercialAspect,
  e: DirectEvidenceText,
): boolean {
  const mentions = ASPECT_WORDS[aspect].test(`${e.foldedHeading}\n${e.foldedText}`);
  return mentions && VALUE_PATTERNS[aspect].test(e.foldedText);
}

export function aspectsNotFound(
  asked: readonly KnowledgeCommercialAspect[],
  direct: readonly DirectEvidenceText[],
): KnowledgeCommercialAspect[] {
  return asked.filter((aspect) => !direct.some((e) => isAspectInformed(aspect, e)));
}
