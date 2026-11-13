import { resolveKnowledgeAccessScope, type KnowledgeAccessScope } from '@voice-agent/contracts';

/**
 * Server-trusted voice identity for knowledge retrieval.
 * Every field must be resolved server-side (call session / published
 * AgentVersion); never populated from model-generated text.
 */
export interface VoiceKnowledgeTrustedContext {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly callId?: string | undefined;
  readonly turnId?: string | undefined;
}

export type VoiceKnowledgeScopeRejection = 'INVALID_TRUSTED_CONTEXT' | 'MISSING_AGENT_BINDING';

export class VoiceKnowledgeScopeError extends Error {
  readonly reason: VoiceKnowledgeScopeRejection;

  constructor(reason: VoiceKnowledgeScopeRejection, message: string) {
    super(message);
    this.name = 'VoiceKnowledgeScopeError';
    this.reason = reason;
  }
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Derives a server-authorized retrieval scope from trusted voice context.
 * The published agent/version identity acts as the binding: retrieval is
 * always agent-scoped, never silently organization-wide. Fail-closed on
 * missing identity or malformed identifiers. Optional output filters
 * (collection) are accepted only from server callers, never from models.
 */
export function resolveVoiceKnowledgeScope(
  trusted: VoiceKnowledgeTrustedContext,
  serverFilters?: { readonly collection?: string | undefined } | undefined,
): KnowledgeAccessScope {
  if (!isNonEmpty(trusted.organizationId)) {
    throw new VoiceKnowledgeScopeError(
      'INVALID_TRUSTED_CONTEXT',
      'Knowledge scope requires a trusted organizationId.',
    );
  }
  if (!isNonEmpty(trusted.agentId) || !isNonEmpty(trusted.agentVersionId)) {
    throw new VoiceKnowledgeScopeError(
      'MISSING_AGENT_BINDING',
      'Knowledge scope requires a published agent/version binding.',
    );
  }

  try {
    return resolveKnowledgeAccessScope({
      organizationId: trusted.organizationId.trim(),
      agentId: trusted.agentId.trim(),
      agentVersionId: trusted.agentVersionId.trim(),
      ...(serverFilters?.collection ? { collection: serverFilters.collection } : {}),
    });
  } catch {
    throw new VoiceKnowledgeScopeError(
      'INVALID_TRUSTED_CONTEXT',
      'Knowledge scope identifiers failed validation.',
    );
  }
}
