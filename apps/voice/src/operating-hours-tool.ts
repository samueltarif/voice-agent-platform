import {
  createZodToolValidator,
  operatingHoursToolInputSchema,
  type AgentConfigurationSnapshotV1,
  type OperatingHoursToolInput,
  type OperatingHoursToolOutput,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import {
  handleOperatingHoursTurn,
  OPERATING_HOURS_CAPABILITY_ID,
} from './operating-hours-turn-handler.js';

export const OPERATING_HOURS_TOOL_NAME = OPERATING_HOURS_CAPABILITY_ID;
export type { OperatingHoursToolOutput };

export interface OperatingHoursToolOptions {
  readonly defaultOperatingHours?: string | undefined;
  readonly snapshotResolver?: (
    context: ToolExecutionContext,
  ) => AgentConfigurationSnapshotV1 | undefined;
}

function resolveTranscript(input: OperatingHoursToolInput): string {
  if (input.query) return input.query;
  if (input.callerTranscript) return input.callerTranscript;
  return 'Qual é o horário de atendimento?';
}

function resolveSnapshot(
  context: ToolExecutionContext,
  options?: OperatingHoursToolOptions,
): AgentConfigurationSnapshotV1 | undefined {
  if (context.snapshot) return context.snapshot;
  if (options?.snapshotResolver) return options.snapshotResolver(context);
  return undefined;
}

function resolveOperatingHours(
  input: OperatingHoursToolInput,
  options?: OperatingHoursToolOptions,
): string | undefined {
  if (input.operatingHours) return input.operatingHours;
  return options?.defaultOperatingHours;
}

export function createOperatingHoursToolDefinition(
  options?: OperatingHoursToolOptions,
): ToolDefinition<OperatingHoursToolInput, OperatingHoursToolOutput> {
  return {
    name: OPERATING_HOURS_TOOL_NAME,
    description: 'Consulta determinística de horários de atendimento do agente.',
    validateInput: createZodToolValidator(operatingHoursToolInputSchema),
    execute: async (
      input: OperatingHoursToolInput,
      context: ToolExecutionContext,
    ): Promise<OperatingHoursToolOutput> => {
      const result = handleOperatingHoursTurn({
        sessionOrganizationId: context.organizationId,
        configurationOrganizationId: context.organizationId,
        callerTranscript: resolveTranscript(input),
        runtimeState: 'ACTIVE',
        operatingHours: resolveOperatingHours(input, options),
        snapshot: resolveSnapshot(context, options),
      });

      if (!result.handled) {
        return { handled: false, responseText: null };
      }

      return {
        handled: true,
        responseText: result.responseText,
      };
    },
  };
}
