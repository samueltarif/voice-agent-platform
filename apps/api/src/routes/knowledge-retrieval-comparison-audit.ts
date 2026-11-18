import type { KnowledgeRetrievalComparison } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';

/**
 * Auditoria da comparação administrativa (B2b, DEC-069): SÓ metadados e
 * contagens. Nunca a pergunta, trechos, títulos, fatos ou texto suspeito.
 */
function v2Counts(v2: KnowledgeRetrievalComparison['v2']) {
  const projection = v2.agentProjection;
  if (!projection) return { v2Facts: 0, v2WithheldUntrusted: 0, v2WithheldCommercialValues: 0 };
  return {
    v2Facts: projection.facts.length,
    v2WithheldUntrusted: projection.withheldUntrusted,
    v2WithheldCommercialValues: projection.withheldCommercialValues,
    v2AspectsRequiringAuthorizedSource: projection.aspectsRequiringAuthorizedSource.length,
  };
}

export function logKnowledgeComparisonAudit(
  logger: Logger,
  input: {
    readonly organizationId: string;
    readonly agentScoped: boolean;
    /** Projeção fora do contrato estrito descartada antes da resposta. */
    readonly projectionDropped?: boolean;
  },
  comparison: KnowledgeRetrievalComparison,
): void {
  logger.info('knowledge.retrieval_comparison', {
    organizationId: input.organizationId,
    agentScoped: input.agentScoped,
    v2ProjectionDropped: input.projectionDropped ?? false,
    v1Hits: comparison.v1.hits.length,
    v2Hits: comparison.v2.hits.length,
    v2SuspiciousPassages: comparison.v2.suspiciousPassages?.length ?? 0,
    ...v2Counts(comparison.v2),
  });
}
