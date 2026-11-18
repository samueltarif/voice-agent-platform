import type { KnowledgeCommercialAspect } from '@voice-agent/contracts';
import {
  extractKnowledgeQueryTerms,
  foldKnowledgeText,
  isKnowledgeStopword,
} from './knowledge-query-terms.js';

/**
 * Análise da pergunta para a busca v2 (DEC-067), determinística e sem IA.
 * Códigos de produto (letras + números: "QT-310", "QT 310", "qt310") viram UM
 * termo normalizado ("qt310"); as palavras seguem a mesma extração da v1.
 */
export interface KnowledgeQueryAnalysisV2 {
  readonly words: readonly string[];
  readonly codes: readonly string[];
  readonly aspects: readonly KnowledgeCommercialAspect[];
}

/** Termos (já normalizados como na v1) que indicam cada aspecto comercial. */
export const KNOWLEDGE_ASPECT_TERMS: Readonly<
  Record<KnowledgeCommercialAspect, readonly string[]>
> = {
  PRICE: ['preco', 'valor', 'custo', 'custa', 'quanto', 'orcamento', 'cotacao'],
  LEAD_TIME: ['prazo', 'entrega'],
  STOCK: ['estoque', 'disponibilidade', 'disponivel'],
  PAYMENT: ['pagamento', 'parcela', 'desconto'],
  WARRANTY: ['garantia'],
};

const SEPARATORS = /[-./]/g;
const LETTERS = /^\p{L}+$/u;
const DIGITS = /^\p{N}+$/u;
const MIXED = /^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}]{3,16}$/u;
const SHORT_CODE_PREFIX = new Set([
  'de',
  'do',
  'da',
  'em',
  'no',
  'na',
  'ao',
  'um',
  'os',
  'as',
  'e',
  'o',
  'a',
]);

/** Palavras da pergunta, sem pontuação exceto separadores internos de código. */
function tokens(queryText: string): string[] {
  return foldKnowledgeText(queryText)
    .replace(/[^\p{L}\p{N}\s\-./]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-./]+|[-./]+$/g, ''))
    .filter((t) => t.length > 0);
}

/** "qt-310" ⇒ "qt310"; "qt" + "310" (prefixo curto seguido de número) ⇒ "qt310". */
function findCodes(list: readonly string[]): { codes: string[]; consumed: Set<number> } {
  const codes: string[] = [];
  const consumed = new Set<number>();
  list.forEach((token, i) => {
    const joined = token.replace(SEPARATORS, '');
    if (MIXED.test(joined)) {
      codes.push(joined);
      consumed.add(i);
      return;
    }
    const next = list[i + 1];
    const prefix = LETTERS.test(token) && token.length <= 4 && !SHORT_CODE_PREFIX.has(token);
    if (prefix && next && DIGITS.test(next) && next.length <= 8) {
      codes.push(`${token}${next}`);
      consumed.add(i).add(i + 1);
    }
  });
  return { codes: [...new Set(codes)], consumed };
}

/**
 * Infinitivo → radical ("calibrar" → "calibr", "comandar" → "comand"), para
 * casar com "calibração", "comando" (o casamento é por início de palavra).
 * Só palavras longas, para não encurtar termos curtos e genéricos.
 */
export function stemVerbV2(word: string): string {
  return word.length >= 7 && /[aei]r$/.test(word) ? word.slice(0, -2) : word;
}

function aspectsOf(words: readonly string[]): KnowledgeCommercialAspect[] {
  return (Object.keys(KNOWLEDGE_ASPECT_TERMS) as KnowledgeCommercialAspect[]).filter((aspect) =>
    KNOWLEDGE_ASPECT_TERMS[aspect].some((term) => words.includes(term)),
  );
}

export function analyzeKnowledgeQueryV2(queryText: string): KnowledgeQueryAnalysisV2 {
  const list = tokens(queryText);
  const { codes, consumed } = findCodes(list);
  const rest = list.filter((_, i) => !consumed.has(i)).join(' ');
  // Com código na pergunta, palavras vazias nunca viram termo (a v1 as usa
  // como último recurso quando a pergunta não tem outra palavra).
  const extracted = rest ? extractKnowledgeQueryTerms(rest).map(stemVerbV2) : [];
  const words = codes.length > 0 ? extracted.filter((w) => !isKnowledgeStopword(w)) : extracted;
  return { words, codes, aspects: aspectsOf(words) };
}
