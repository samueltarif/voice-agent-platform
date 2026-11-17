import { eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  type KnowledgeAccessScope,
  type KnowledgeRetrievalQuery,
  KNOWLEDGE_ACCENTED_CHARS,
  KNOWLEDGE_PLAIN_CHARS,
} from '@voice-agent/contracts';
import { knowledgeChunks, knowledgeDocuments } from '../schema/knowledge.js';

/**
 * Predicados de escopo e de filtros da busca (v1, movidos sem mudança para
 * serem reaproveitados pela v2 — DEC-067): organização, documento pronto,
 * coleção, agente e versão; ids e tipos de origem pedidos.
 */
/** Casa o termo sem distinguir acento nem caixa (o termo já vem normalizado). */
function termMatches(term: string): SQL {
  return sql`translate(${knowledgeChunks.text}, ${KNOWLEDGE_ACCENTED_CHARS}, ${KNOWLEDGE_PLAIN_CHARS}) ilike ${`%${term}%`}`;
}

export function buildScopePredicates(scope: KnowledgeAccessScope): SQL[] {
  const clauses: SQL[] = [
    eq(knowledgeChunks.organizationId, scope.organizationId),
    eq(knowledgeDocuments.organizationId, scope.organizationId),
    eq(knowledgeDocuments.status, 'READY'),
  ];

  if (scope.collection) {
    clauses.push(eq(knowledgeDocuments.collection, scope.collection));
  }
  if (scope.agentId) {
    clauses.push(
      or(isNull(knowledgeDocuments.agentId), eq(knowledgeDocuments.agentId, scope.agentId))!,
    );
  }
  if (scope.agentVersionId) {
    clauses.push(
      or(
        isNull(knowledgeDocuments.agentVersionId),
        eq(knowledgeDocuments.agentVersionId, scope.agentVersionId),
      )!,
    );
  }

  return clauses;
}

export function buildQueryPredicates(
  query: KnowledgeRetrievalQuery,
  tokens: readonly string[],
): SQL[] {
  const clauses: SQL[] = [];

  if (query.documentIds && query.documentIds.length > 0) {
    clauses.push(inArray(knowledgeDocuments.id, query.documentIds));
  }
  if (query.sourceTypes && query.sourceTypes.length > 0) {
    clauses.push(inArray(knowledgeDocuments.sourceType, query.sourceTypes));
  }
  if (tokens.length > 0) {
    clauses.push(or(...tokens.map(termMatches))!);
  }

  return clauses;
}
