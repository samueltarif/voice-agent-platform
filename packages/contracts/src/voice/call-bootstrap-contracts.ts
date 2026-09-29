import { z } from 'zod';
import { agentConfigurationSnapshotV1Schema } from '../agents/agent-configuration-v1.js';
import type { AgentConfigurationSnapshotV1 } from '../agents/agent-configuration-v1.js';

export const CALL_BOOTSTRAP_STATUSES = ['PENDING', 'CONSUMED', 'EXPIRED'] as const;
export const callBootstrapStatusSchema = z.enum(CALL_BOOTSTRAP_STATUSES);
export type CallBootstrapStatus = z.infer<typeof callBootstrapStatusSchema>;

export interface CallBootstrap {
  readonly bootstrapId: string;
  readonly callId: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly agentSnapshot: AgentConfigurationSnapshotV1;
  readonly status: CallBootstrapStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt?: Date | undefined;
  readonly providerCallId?: string | undefined;
}

export const callBootstrapSchema = z
  .object({
    bootstrapId: z.string().uuid(),
    callId: z.string().uuid(),
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    agentVersionId: z.string().uuid(),
    agentSnapshot: agentConfigurationSnapshotV1Schema,
    status: callBootstrapStatusSchema,
    createdAt: z.date(),
    expiresAt: z.date(),
    consumedAt: z.date().optional(),
    providerCallId: z.string().min(1).optional(),
  })
  .strict();

export interface CallBootstrapRegistryPort {
  register(bootstrap: CallBootstrap): Promise<void>;
  getById(bootstrapId: string): Promise<CallBootstrap | null>;
  consume(bootstrapId: string, now?: Date): Promise<CallBootstrap>;
}
