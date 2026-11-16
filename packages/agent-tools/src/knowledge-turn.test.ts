import { describe, it, expect } from 'vitest';
import type {
  KnowledgeRetrievalHit,
  KnowledgeRetrievalRequest,
  ToolExecutionContext,
} from '@voice-agent/contracts';
import { InMemoryToolRegistry } from './tool-registry.js';
import { createKnowledgeSearchToolDefinition } from './knowledge-search-tool.js';
import { runKnowledgeTurn, SIMULATED_REPLY } from './knowledge-turn.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTEXT: ToolExecutionContext = {
  organizationId: ORG,
  agentId: '22222222-2222-4222-8222-222222222222',
  agentVersionId: '33333333-3333-4333-8333-333333333333',
};
const DOC = '55555555-5555-4555-8555-555555555555';
const CHUNK = '66666666-6666-4666-8666-000000000001';

const PRODUCT: KnowledgeRetrievalHit = {
  chunkId: CHUNK,
  documentId: DOC,
  organizationId: ORG,
  textSnapshot: 'Transmissor de Pressão QT-310.',
  documentTitle: 'Catálogo',
  score: 0.5,
  relevance: 'DIRECT',
  provenance: {
    organizationId: ORG,
    documentId: DOC,
    chunkId: CHUNK,
    chunkOrdinal: 1,
    policyVersion: 'v1',
  },
  citation: {
    documentId: DOC,
    chunkId: CHUNK,
    sourceType: 'PRODUCT_MANUAL',
    sourceLocator: 'catalogo.md',
    chunkOrdinal: 1,
  },
};

function registryWith(requests: KnowledgeRetrievalRequest[]) {
  const registry = new InMemoryToolRegistry();
  registry.registerTool(
    createKnowledgeSearchToolDefinition({
      retrievalPort: {
        retrieve: async (request) => {
          requests.push(request);
          return { hits: [PRODUCT], truncated: false, unmatchedTerms: [] };
        },
      },
    }),
  );
  return registry;
}

/** Núcleo compartilhado (DEC-061): o autorizador recebido decide; nada é executado sem ele. */
describe('runKnowledgeTurn (shared core)', () => {
  it('runs knowledge.search with the server context when the authorizer allows it', async () => {
    const requests: KnowledgeRetrievalRequest[] = [];
    const turn = await runKnowledgeTurn({
      registry: registryWith(requests),
      isToolAllowed: (tool, ctx) => tool === 'knowledge.search' && ctx.organizationId === ORG,
      context: CONTEXT,
      utterance: 'transmissor',
    });
    expect(turn.outcome).toBe('ANSWERED_WITH_EVIDENCE');
    expect(requests[0]!.scope).toEqual({
      organizationId: ORG,
      agentId: CONTEXT.agentId,
      agentVersionId: CONTEXT.agentVersionId,
    });
  });

  it('never searches when the authorizer refuses', async () => {
    const requests: KnowledgeRetrievalRequest[] = [];
    const turn = await runKnowledgeTurn({
      registry: registryWith(requests),
      isToolAllowed: () => false,
      context: CONTEXT,
      utterance: 'transmissor',
    });
    expect(turn).toEqual({
      outcome: 'TOOL_NOT_ENABLED',
      replyText: SIMULATED_REPLY.notEnabled,
      evidence: [],
      unmatchedTerms: [],
    });
    expect(requests).toEqual([]);
  });

  it('refuses to run without an authorizer (fail-closed engine)', async () => {
    await expect(
      runKnowledgeTurn({
        registry: registryWith([]),
        isToolAllowed: undefined as never,
        context: CONTEXT,
        utterance: 'transmissor',
      }),
    ).rejects.toThrow();
  });
});
