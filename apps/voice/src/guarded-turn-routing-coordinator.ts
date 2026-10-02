import type {
  AgentConfigurationSnapshotV1,
  AuxiliaryTurnDecisionOutput,
  AuxiliaryTurnDecisionPort,
  CallSession,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import type { DeterministicResponseDeliveryCoordinator } from './deterministic-response-delivery-coordinator.js';
import { interpretFrozenTurnPolicy } from './frozen-policy-interpreter.js';
import { matchesOperatingHoursCapability } from './operating-hours-capability-matcher.js';
import { handleOperatingHoursTurn } from './operating-hours-turn-handler.js';
import {
  CANONICAL_SECURITY_BLOCKED_RESPONSE,
  resolveSecurityBlockedDeliveryInput,
} from './security-blocked-response.js';

export type GuardedRoutingOutcome =
  'GENERATIVE' | 'DETERMINISTIC_RESPONSE' | 'SECURITY_BLOCKED' | 'STALE';

export interface GuardedRoutingResult {
  readonly outcome: GuardedRoutingOutcome;
  readonly responseText?: string | undefined;
}

export interface GuardedTurnRoutingInput {
  readonly session: CallSession;
  readonly turnId: string;
  readonly generationId: string;
  readonly callerTranscript: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly configurationOrganizationId?: string | undefined;
}

export interface GuardedTurnRoutingCoordinatorDependencies {
  readonly port: AuxiliaryTurnDecisionPort;
  readonly deliveryCoordinator: DeterministicResponseDeliveryCoordinator;
  readonly logger?: Logger | undefined;
  readonly isGenerationActive: (callId: string, generationId: string) => boolean;
}

export class GuardedTurnRoutingCoordinator {
  private readonly deps: GuardedTurnRoutingCoordinatorDependencies;
  private readonly logger: Logger;

  constructor(deps: GuardedTurnRoutingCoordinatorDependencies) {
    this.deps = deps;
    this.logger = deps.logger ?? createNullLogger();
  }

  private async evaluateAuxiliary(
    input: GuardedTurnRoutingInput,
  ): Promise<AuxiliaryTurnDecisionOutput | null> {
    try {
      return await this.deps.port.evaluateTurn({
        organizationId: input.session.organizationId,
        callId: input.session.callId,
        turnId: input.turnId,
        callerTranscript: input.callerTranscript,
      });
    } catch (err) {
      this.logger.warn('guarded.routing.auxiliary_error_fail_open', {
        callId: input.session.callId,
        turnId: input.turnId,
        organizationId: input.session.organizationId,
        errorMessage: err instanceof Error ? err.message : 'Auxiliary evaluation failed',
      });
      return null;
    }
  }

  private async dispatchSecurity(input: GuardedTurnRoutingInput): Promise<GuardedRoutingResult> {
    const delivery = await this.deps.deliveryCoordinator.deliver(
      resolveSecurityBlockedDeliveryInput({
        organizationId: input.session.organizationId,
        callId: input.session.callId,
        assistantTurnId: input.turnId,
        generationId: input.generationId,
      }),
    );
    if (delivery.staleBefore) return { outcome: 'STALE' };
    return {
      outcome: 'SECURITY_BLOCKED',
      responseText: CANONICAL_SECURITY_BLOCKED_RESPONSE,
    };
  }

  private async dispatchDeterministic(
    input: GuardedTurnRoutingInput,
  ): Promise<GuardedRoutingResult> {
    const handlerResult = handleOperatingHoursTurn({
      sessionOrganizationId: input.session.organizationId,
      configurationOrganizationId:
        input.configurationOrganizationId ?? input.session.organizationId,
      runtimeState: input.session.runtimeState,
      callerTranscript: input.callerTranscript,
      snapshot: input.snapshot,
    });

    if (!handlerResult.handled) return { outcome: 'GENERATIVE' };
    if (!this.deps.isGenerationActive(input.session.callId, input.generationId)) {
      return { outcome: 'STALE' };
    }

    const delivery = await this.deps.deliveryCoordinator.deliver({
      organizationId: input.session.organizationId,
      callId: input.session.callId,
      assistantTurnId: input.turnId,
      generationId: input.generationId,
      responseText: handlerResult.responseText,
    });
    if (delivery.staleBefore) return { outcome: 'STALE' };

    return {
      outcome: 'DETERMINISTIC_RESPONSE',
      responseText: handlerResult.responseText,
    };
  }

  async routeTurn(input: GuardedTurnRoutingInput): Promise<GuardedRoutingResult> {
    const { session, generationId, callerTranscript } = input;
    if (!matchesOperatingHoursCapability(callerTranscript)) return { outcome: 'GENERATIVE' };
    if (!this.deps.isGenerationActive(session.callId, generationId)) return { outcome: 'STALE' };

    const auxiliaryOutput = await this.evaluateAuxiliary(input);
    if (!auxiliaryOutput) return { outcome: 'GENERATIVE' };

    if (!this.deps.isGenerationActive(session.callId, generationId)) return { outcome: 'STALE' };

    const classification = interpretFrozenTurnPolicy({
      securityScore: auxiliaryOutput.securityScore,
      deterministicScore: auxiliaryOutput.deterministicScore,
      generativeScore: auxiliaryOutput.generativeScore,
    });

    if (classification === 'SECURITY_ESCALATE') return this.dispatchSecurity(input);
    if (classification === 'DETERMINISTIC_CANDIDATE') return this.dispatchDeterministic(input);
    return { outcome: 'GENERATIVE' };
  }
}
