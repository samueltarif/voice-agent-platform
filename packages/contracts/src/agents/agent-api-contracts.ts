import { z } from 'zod';
import {
  agentConfigurationSnapshotV1Schema,
  type AgentConfigurationSnapshotV1,
} from './agent-configuration-v1.js';
import type { AgentStatus } from './agent-status.js';
import type { AgentVersionStatus } from './agent-version-status.js';

export const serviceAssertionClaimsSchema = z
  .object({
    sub: z.string().min(1),
    orgId: z.string().uuid(),
    iss: z.string().min(1),
    aud: z.string().min(1),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    jti: z.string().min(1),
  })
  .strict();

export type ServiceAssertionClaims = z.infer<typeof serviceAssertionClaimsSchema>;

export const createAgentHttpBodySchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  })
  .strict();

export type CreateAgentHttpBody = z.infer<typeof createAgentHttpBodySchema>;

export const createDraftHttpBodySchema = z
  .object({
    configuration: agentConfigurationSnapshotV1Schema,
    changelog: z.string().max(500).optional(),
  })
  .strict();

export type CreateDraftHttpBody = z.infer<typeof createDraftHttpBodySchema>;

export const updateDraftHttpBodySchema = z
  .object({
    configuration: agentConfigurationSnapshotV1Schema,
    changelog: z.string().max(500).optional(),
  })
  .strict();

export type UpdateDraftHttpBody = z.infer<typeof updateDraftHttpBodySchema>;

export interface AgentMetadataResponse {
  id: string;
  name: string;
  slug: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  currentPublishedVersionNumber: number | null;
}

export interface AgentVersionMetadataResponse {
  id: string;
  versionNumber: number;
  status: AgentVersionStatus;
  configurationSchemaVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentVersionConfigurationResponse {
  agentId: string;
  versionId: string;
  versionNumber: number;
  status: AgentVersionStatus;
  changelog: string | null;
  configuration: AgentConfigurationSnapshotV1;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
