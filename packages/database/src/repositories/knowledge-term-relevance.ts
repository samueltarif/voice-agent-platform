import type { KnowledgeHitRelevance } from '@voice-agent/contracts';

/**
 * Relevância determinística (sem IA): separa termos CENTRAIS (o que se procura:
 * produto, modelo, serviço específico) de termos GENÉRICOS (preço, prazo,
 * disponibilidade, verbos de compra) e de termos UBÍQUOS (presentes em mais da
 * metade dos trechos do escopo, como o nome da empresa).
 *
 * Regra: se a pergunta tem termo central e NENHUM aparece nos documentos, não
 * há evidência e nada é devolvido ("preço do helicóptero"). Se algum aparece,
 * vêm primeiro os trechos que o contêm (DIRECT) e depois, como contexto, os que
 * só têm termos genéricos (CONTEXT). Palavra desconhecida nunca bloqueia a
 * pergunta: só aparece em `unmatchedTerms`.
 */

/** Formas já normalizadas (sem acento, singular) por `extractKnowledgeQueryTerms`. */
export const KNOWLEDGE_GENERIC_TERMS: ReadonlySet<string> = new Set(
  (
    'preco valor custo custa quanto orcamento cotacao desconto pagamento parcela frete ' +
    'prazo entrega disponibilidade disponivel estoque garantia informacao detalhe ' +
    'especificacao caracteristica catalogo produto servico item iten modelo tipo opcao ' +
    'empresa oferece oferecem ofereca vende vendem venda fornece fornecem fornecimento ' +
    'possui possuem trabalha trabalham existe comprar compra quero gostaria saber ' +
    'informar preciso consulta ' +
    // Verbos frequentes em perguntas (não identificam produto).
    'funciona funcionam fazer faz fazem pode podem posso consigo seria sao esta estao fica ' +
    'ficam atende atendem cobra cobram'
  ).split(' '),
);

/** Escopo mínimo para considerar um termo ubíquo (evita falso positivo em base pequena). */
export const KNOWLEDGE_UBIQUITY_MIN_CHUNKS = 4;
export const KNOWLEDGE_UBIQUITY_RATIO = 0.5;

export interface KnowledgeTermPlan {
  /** Termos que identificam o assunto; pelo menos um precisa aparecer. */
  readonly central: readonly string[];
  /** Termos centrais que não aparecem em nenhum trecho do escopo. */
  readonly unmatched: readonly string[];
}

/**
 * `documentFrequency[i]` = trechos do escopo que contêm `terms[i]`;
 * `scopeChunkCount` = total de trechos prontos no escopo.
 */
export function planKnowledgeTerms(
  terms: readonly string[],
  documentFrequency: readonly number[],
  scopeChunkCount: number,
): KnowledgeTermPlan {
  const ubiquitous = (i: number) =>
    scopeChunkCount >= KNOWLEDGE_UBIQUITY_MIN_CHUNKS &&
    (documentFrequency[i] ?? 0) / scopeChunkCount > KNOWLEDGE_UBIQUITY_RATIO;
  const central = terms.filter((t, i) => !KNOWLEDGE_GENERIC_TERMS.has(t) && !ubiquitous(i));
  const unmatched = central.filter((t) => (documentFrequency[terms.indexOf(t)] ?? 0) === 0);
  return { central, unmatched };
}

/** Classificação de um trecho já pontuado; `null` = descartar. */
export function classifyKnowledgeHit(
  foldedText: string,
  plan: KnowledgeTermPlan,
): KnowledgeHitRelevance | null {
  if (plan.central.length === 0) return 'DIRECT';
  if (plan.central.length === plan.unmatched.length) return null;
  return plan.central.some((t) => foldedText.includes(t)) ? 'DIRECT' : 'CONTEXT';
}
