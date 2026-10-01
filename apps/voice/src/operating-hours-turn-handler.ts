import type { AgentConfigurationSnapshotV1, CallSessionState } from '@voice-agent/contracts';
import { matchesOperatingHoursCapability } from './operating-hours-capability-matcher.js';

export const OPERATING_HOURS_CAPABILITY_ID = 'agent.operating_hours' as const;
export type OperatingHoursCapabilityId = typeof OPERATING_HOURS_CAPABILITY_ID;

export interface OperatingHoursTurnHandlerInput {
  readonly sessionOrganizationId: string;
  readonly configurationOrganizationId: string;
  readonly runtimeState?: CallSessionState | string | undefined;
  readonly callerTranscript: string;
  readonly operatingHours?: string | null | undefined;
  readonly snapshot?: AgentConfigurationSnapshotV1 | undefined;
}

export type OperatingHoursHandlerResult =
  | {
      readonly handled: true;
      readonly capabilityId: OperatingHoursCapabilityId;
      readonly responseText: string;
    }
  | {
      readonly handled: false;
      readonly capabilityId: OperatingHoursCapabilityId;
    };

function isTenantMatchValid(sessionOrg: string, configOrg: string): boolean {
  if (!sessionOrg || !configOrg) {
    return false;
  }
  return sessionOrg === configOrg;
}

function isRuntimeStateValid(state?: string): boolean {
  if (state === undefined) {
    return true;
  }
  return state === 'ACTIVE';
}

function extractOperatingHours(input: OperatingHoursTurnHandlerInput): string | null {
  const direct = input.operatingHours;
  if (typeof direct === 'string') {
    const trimmed = direct.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const fromSnapshot = input.snapshot?.rules?.deterministic?.operatingHours;
  if (typeof fromSnapshot === 'string') {
    const trimmed = fromSnapshot.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function isTranscriptEligible(transcript: unknown): boolean {
  if (typeof transcript !== 'string') {
    return false;
  }
  return matchesOperatingHoursCapability(transcript);
}

/**
 * Pure deterministic turn handler for operating hours queries.
 *
 * Requirements:
 * - Read-only and side-effect free.
 * - Enforces tenant matching between active session and agent configuration.
 * - Enforces runtime state is ACTIVE when provided.
 * - Enforces presence of operatingHours configuration.
 * - Delegates transcript eligibility to narrow deterministic capability matcher.
 * - Fails closed on any guard failure.
 */
export function handleOperatingHoursTurn(
  input: OperatingHoursTurnHandlerInput,
): OperatingHoursHandlerResult {
  if (!isTenantMatchValid(input.sessionOrganizationId, input.configurationOrganizationId)) {
    return { handled: false, capabilityId: OPERATING_HOURS_CAPABILITY_ID };
  }

  if (!isRuntimeStateValid(input.runtimeState)) {
    return { handled: false, capabilityId: OPERATING_HOURS_CAPABILITY_ID };
  }

  const operatingHours = extractOperatingHours(input);
  if (!operatingHours) {
    return { handled: false, capabilityId: OPERATING_HOURS_CAPABILITY_ID };
  }

  if (!isTranscriptEligible(input.callerTranscript)) {
    return { handled: false, capabilityId: OPERATING_HOURS_CAPABILITY_ID };
  }

  return {
    handled: true,
    capabilityId: OPERATING_HOURS_CAPABILITY_ID,
    responseText: `Nosso horário de atendimento é: ${operatingHours}.`,
  };
}
