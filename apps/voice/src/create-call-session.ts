import type { CallSession, CreateCallSessionInput } from '@voice-agent/contracts';
import { createCallSessionInputSchema } from '@voice-agent/contracts';
import { InvalidAgentVersionStatusError } from '@voice-agent/errors';

export function createCallSession(input: CreateCallSessionInput): CallSession {
  const validated = createCallSessionInputSchema.parse(input);

  if (validated.agentVersionStatus && validated.agentVersionStatus !== 'PUBLISHED') {
    throw new InvalidAgentVersionStatusError(
      `Cannot start call session with agent version status '${validated.agentVersionStatus}'. Only PUBLISHED versions are allowed.`,
    );
  }

  return {
    callId: validated.callId,
    organizationId: validated.organizationId,
    agentId: validated.agentId,
    agentVersionId: validated.agentVersionId,
    runtimeState: 'CREATED',
    currentTurnId: null,
    generationId: null,
    startedAt: new Date(),
    endedAt: null,
  };
}
