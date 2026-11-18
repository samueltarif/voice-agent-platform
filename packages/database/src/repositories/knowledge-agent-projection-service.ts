import {
  knowledgeAccessScopeSchema,
  knowledgeAgentProjectionSchema,
  knowledgeRetrievalQuerySchema,
  type KnowledgeAgentProjection,
  type KnowledgeAgentProjectionPort,
  type KnowledgeAgentProjectionRequest,
} from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';
import { retrieveKnowledgeV2Detailed } from './knowledge-retrieval-v2.js';

/**
 * B2a (DEC-071): ÚNICA fonte do ramo `v2` de `knowledge.search`. Devolve só a
 * projeção sanitizada da B2b (`result.agentProjection`), validada de novo pelo
 * contrato estrito. `hits` (texto bruto, inclusive valores comerciais) e
 * `suspicious` são descartados aqui e nunca saem deste módulo.
 */
export class DrizzleKnowledgeAgentProjectionService implements KnowledgeAgentProjectionPort {
  constructor(private readonly db: DatabaseInstance) {}

  async project(request: KnowledgeAgentProjectionRequest): Promise<KnowledgeAgentProjection> {
    const scope = knowledgeAccessScopeSchema.parse(request.scope);
    const query = knowledgeRetrievalQuerySchema.parse({
      queryText: request.queryText,
      topK: request.topK,
      retrievalProfile: 'v2',
    });
    const { result } = await retrieveKnowledgeV2Detailed(this.db, scope, query);
    // Ausente ou fora do contrato: lança (o chamador converte em falha controlada).
    return knowledgeAgentProjectionSchema.parse(result.agentProjection);
  }
}
