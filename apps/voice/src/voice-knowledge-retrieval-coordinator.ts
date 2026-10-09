import { knowledgeRetrievalQuerySchema, type KnowledgeRetrievalPort } from '@voice-agent/contracts';
import {
  resolveVoiceKnowledgeScope,
  VoiceKnowledgeScopeError,
  type VoiceKnowledgeTrustedContext,
} from './voice-knowledge-scope.js';
import {
  buildVoiceKnowledgeEnvelope,
  type VoiceKnowledgeContextEnvelope,
} from './voice-knowledge-context-envelope.js';

export interface VoiceKnowledgeHandoffInput {
  /** Caller (turn) text. Treated as untrusted query input, never as authority. */
  readonly queryText: string;
  readonly topK?: number | undefined;
  /** Server-provided output filters only; never accepted from model text. */
  readonly collection?: string | undefined;
  readonly documentIds?: readonly string[] | undefined;
}

export type VoiceKnowledgeHandoffRejection =
  'INVALID_TRUSTED_CONTEXT' | 'MISSING_AGENT_BINDING' | 'INVALID_QUERY' | 'RETRIEVAL_FAILED';

export interface VoiceKnowledgeHandoffSuccess {
  readonly status: 'SUCCESS';
  readonly envelope: VoiceKnowledgeContextEnvelope;
}

export interface VoiceKnowledgeHandoffRejected {
  readonly status: 'REJECTED';
  readonly reason: VoiceKnowledgeHandoffRejection;
  readonly message: string;
}

export type VoiceKnowledgeHandoffResult =
  VoiceKnowledgeHandoffSuccess | VoiceKnowledgeHandoffRejected;

export interface VoiceKnowledgeCoordinatorOptions {
  readonly retrievalPort: KnowledgeRetrievalPort;
}

function reject(
  reason: VoiceKnowledgeHandoffRejection,
  message: string,
): VoiceKnowledgeHandoffRejected {
  return { status: 'REJECTED', reason, message };
}

/**
 * Offline voice knowledge handoff. Resolves a server-authorized scope from
 * trusted voice identity, runs one bounded retrieval, and returns an
 * explicitly untrusted envelope. Single attempt, no retries, no fallback
 * to broader tenant access. The port interface exposes no cancellation,
 * so timeout handling is deferred to a future port revision.
 * NOT registered in any production composition root.
 */
export async function runVoiceKnowledgeHandoff(
  options: VoiceKnowledgeCoordinatorOptions,
  trusted: VoiceKnowledgeTrustedContext,
  input: VoiceKnowledgeHandoffInput,
): Promise<VoiceKnowledgeHandoffResult> {
  let scope;
  try {
    scope = resolveVoiceKnowledgeScope(trusted, { collection: input.collection });
  } catch (error) {
    if (error instanceof VoiceKnowledgeScopeError) {
      return reject(error.reason, error.message);
    }
    return reject('INVALID_TRUSTED_CONTEXT', 'Knowledge scope resolution failed.');
  }

  const queryText = input.queryText?.trim() ?? '';
  const parsedQuery = knowledgeRetrievalQuerySchema.safeParse({
    queryText,
    ...(input.topK !== undefined ? { topK: input.topK } : {}),
    ...(input.documentIds !== undefined ? { documentIds: [...input.documentIds] } : {}),
  });
  if (!parsedQuery.success || queryText.length === 0) {
    return reject('INVALID_QUERY', 'Knowledge query text and bounds failed validation.');
  }

  let result;
  try {
    result = await options.retrievalPort.retrieve({ scope, query: parsedQuery.data });
  } catch {
    return reject('RETRIEVAL_FAILED', 'Knowledge retrieval failed without results.');
  }

  return {
    status: 'SUCCESS',
    envelope: buildVoiceKnowledgeEnvelope(result.hits, queryText, result.truncated),
  };
}
