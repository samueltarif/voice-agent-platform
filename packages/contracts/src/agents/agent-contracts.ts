import { z } from 'zod';
import { agentConfigurationSnapshotV1Schema } from './agent-configuration-v1.js';

export const agentSlugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must consist of lowercase alphanumeric characters and hyphens',
  });

export const createAgentInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(255),
    slug: agentSlugSchema,
  })
  .strict();

export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;

export const createDraftInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    createdBy: z.string().min(1),
    configurationSchemaVersion: z.literal(1),
    configuration: agentConfigurationSnapshotV1Schema,
    changelog: z.string().max(1000).optional(),
  })
  .strict();

export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;

export const updateDraftInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    draftId: z.string().uuid(),
    configuration: agentConfigurationSnapshotV1Schema,
    changelog: z.string().max(1000).optional(),
  })
  .strict();

export type UpdateDraftInput = z.infer<typeof updateDraftInputSchema>;

export const publishDraftInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    draftId: z.string().uuid(),
    publishedBy: z.string().min(1),
  })
  .strict();

export type PublishDraftInput = z.infer<typeof publishDraftInputSchema>;

export const discardDraftInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    draftId: z.string().uuid(),
    actorUserId: z.string().min(1),
  })
  .strict();

export type DiscardDraftInput = z.infer<typeof discardDraftInputSchema>;

export const archiveAgentInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    actorUserId: z.string().min(1),
  })
  .strict();

export type ArchiveAgentInput = z.infer<typeof archiveAgentInputSchema>;

export const reactivateAgentInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    actorUserId: z.string().min(1),
  })
  .strict();

export type ReactivateAgentInput = z.infer<typeof reactivateAgentInputSchema>;
