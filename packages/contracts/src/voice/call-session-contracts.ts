import { z } from 'zod';
import { agentVersionStatusSchema } from '../agents/agent-version-status.js';

export const CALL_SESSION_STATES = [
  'CREATED',
  'CONNECTING',
  'ACTIVE',
  'ENDING',
  'ENDED',
  'FAILED',
] as const;

export const callSessionStateSchema = z.enum(CALL_SESSION_STATES);
export type CallSessionState = z.infer<typeof callSessionStateSchema>;

export const TERMINAL_CALL_SESSION_STATES: ReadonlySet<CallSessionState> = new Set([
  'ENDED',
  'FAILED',
]);

export interface CallSession {
  readonly callId: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly runtimeState: CallSessionState;
  readonly currentTurnId: string | null;
  readonly generationId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly failureReason?: string;
}

export const createCallSessionInputSchema = z
  .object({
    callId: z.string().uuid(),
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    agentVersionStatus: agentVersionStatusSchema.optional(),
  })
  .strict();

export type CreateCallSessionInput = z.infer<typeof createCallSessionInputSchema>;
