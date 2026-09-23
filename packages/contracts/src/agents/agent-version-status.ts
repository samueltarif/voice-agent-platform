import { z } from 'zod';

export const AGENT_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export const agentVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export type AgentVersionStatus = z.infer<typeof agentVersionStatusSchema>;
