import { foldKnowledgeText } from './knowledge-excerpt.js';

/**
 * Termos de busca da Base de Conhecimento em português (sem IA): minúsculas,
 * sem acentos, sem palavras vazias e com plural reduzido, para que
 * "Quais transmissores de pressão?" encontre "Transmissor de Pressão".
 * É uma busca lexical determinística; não interpreta nem segue o texto.
 */

/** Acentos tratados igualmente no banco (translate) e aqui. */
export const KNOWLEDGE_ACCENTED_CHARS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
export const KNOWLEDGE_PLAIN_CHARS = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';

export const KNOWLEDGE_MAX_QUERY_TERMS = 16;

const STOPWORDS = new Set(
  (
    'a ao aos as com como da das de do dos e ela ele em entre essa esse esta este eu ha ' +
    'isso ja mais mas me na nas no nos o os ou para pela pelo por qual quais quando que quem se sem ser seu sua sobre tem um uma vc voce voces'
  ).split(' '),
);

/** Sufixo de plural → substituição, na ordem de teste. */
const PLURAL_RULES: readonly (readonly [RegExp, string])[] = [
  [/[oa]es$/, 'ao'],
  [/ais$/, 'al'],
  [/eis$/, 'el'],
  [/([rsz])es$/, '$1'],
  [/([^s])s$/, '$1'],
];

/** Plural português mais comum → singular; o termo casa por substring. */
export function stemKnowledgeTerm(term: string): string {
  if (term.length <= 4 || /^\d+$/.test(term)) return term;
  const rule = PLURAL_RULES.find(([pattern]) => pattern.test(term));
  return rule ? term.replace(rule[0], rule[1]) : term;
}

function isSignificant(term: string): boolean {
  if (STOPWORDS.has(term)) return false;
  return term.length > 2 || /^\d{2,}$/.test(term);
}

/** Termos normalizados, sem repetição e limitados; nunca vazio para texto com letras. */
export function extractKnowledgeQueryTerms(queryText: string): string[] {
  const words = foldKnowledgeText(queryText)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const significant = words.filter(isSignificant).map(stemKnowledgeTerm);
  const chosen = significant.length > 0 ? significant : words;
  return [...new Set(chosen)].slice(0, KNOWLEDGE_MAX_QUERY_TERMS);
}
