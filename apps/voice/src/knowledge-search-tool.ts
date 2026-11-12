import {
  buildKnowledgeExcerpt,
  createZodToolValidator,
  extractKnowledgeQueryTerms,
  KNOWLEDGE_SEARCH_DEFAULT_RESULTS,
  KNOWLEDGE_SEARCH_MAX_EXCERPT_CHARS,
  KNOWLEDGE_SEARCH_MAX_TITLE_CHARS,
  KNOWLEDGE_SEARCH_MAX_TOTAL_CHARS,
  KNOWLEDGE_SEARCH_TOOL_NAME,
  KNOWLEDGE_SEARCH_USAGE,
  knowledgeSearchToolInputSchema,
  type KnowledgeRetrievalHit,
  type KnowledgeRetrievalPort,
  type KnowledgeSearchToolInput,
  type KnowledgeSearchToolOutput,
  type KnowledgeSearchToolResult,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import { resolveVoiceKnowledgeScope } from './voice-knowledge-scope.js';

export interface KnowledgeSearchToolOptions {
  readonly retrievalPort: KnowledgeRetrievalPort;
}

function toResult(hit: KnowledgeRetrievalHit, terms: readonly string[]): KnowledgeSearchToolResult {
  const title = hit.documentTitle ?? hit.citation.sourceLocator;
  return {
    citationId: `${hit.documentId}:${hit.chunkId}:${hit.citation.chunkOrdinal}`,
    documentTitle: title.slice(0, KNOWLEDGE_SEARCH_MAX_TITLE_CHARS),
    sourceType: hit.citation.sourceType,
    excerpt: buildKnowledgeExcerpt(hit.textSnapshot, terms, KNOWLEDGE_SEARCH_MAX_EXCERPT_CHARS),
    score: Math.min(1, Math.max(0, hit.score)),
  };
}

/** Mantém a ordem de relevância e para no teto total de caracteres. */
function boundResults(
  hits: readonly KnowledgeRetrievalHit[],
  terms: readonly string[],
): { results: KnowledgeSearchToolResult[]; cut: boolean } {
  const results: KnowledgeSearchToolResult[] = [];
  let total = 0;
  for (const hit of hits) {
    const result = toResult(hit, terms);
    if (total + result.excerpt.length > KNOWLEDGE_SEARCH_MAX_TOTAL_CHARS) {
      return { results, cut: true };
    }
    results.push(result);
    total += result.excerpt.length;
  }
  return { results, cut: false };
}

/**
 * `knowledge.search` (DEC-056). O escopo é derivado SÓ do contexto montado a
 * partir da concessão da versão publicada (organização, agente, versão); falta
 * de agente ou versão lança erro (fail-closed, sem ampliar para a organização).
 * Os trechos são dados não confiáveis e vêm acompanhados de `usage` fixo.
 * NÃO registrada em composição de produção.
 */
export function createKnowledgeSearchToolDefinition(
  options: KnowledgeSearchToolOptions,
): ToolDefinition<KnowledgeSearchToolInput, KnowledgeSearchToolOutput> {
  return {
    name: KNOWLEDGE_SEARCH_TOOL_NAME,
    description: 'Busca trechos dos documentos da organização liberados para este agente.',
    validateInput: createZodToolValidator(knowledgeSearchToolInputSchema),
    execute: async (
      input: KnowledgeSearchToolInput,
      context: ToolExecutionContext,
    ): Promise<KnowledgeSearchToolOutput> => {
      const scope = resolveVoiceKnowledgeScope({
        organizationId: context.organizationId,
        agentId: context.agentId ?? '',
        agentVersionId: context.agentVersionId ?? '',
      });
      const limit = input.limit ?? KNOWLEDGE_SEARCH_DEFAULT_RESULTS;
      const retrieved = await options.retrievalPort.retrieve({
        scope,
        query: { queryText: input.query, topK: limit },
      });
      const terms = extractKnowledgeQueryTerms(input.query);
      const { results, cut } = boundResults(retrieved.hits.slice(0, limit), terms);
      return {
        trust: 'UNTRUSTED_DATA',
        found: results.length > 0,
        results,
        truncated: retrieved.truncated || cut,
        usage: KNOWLEDGE_SEARCH_USAGE,
      };
    },
  };
}
