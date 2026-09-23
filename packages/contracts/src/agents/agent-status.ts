import { z } from 'zod';

export const AGENT_STATUS = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export const agentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export type AgentStatus = z.infer<typeof agentStatusSchema>;
