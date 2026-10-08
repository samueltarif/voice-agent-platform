import { z } from 'zod';

export const knowledgeAccessScopeSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid().optional(),
    agentVersionId: z.string().uuid().optional(),
    collection: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type KnowledgeAccessScope = z.infer<typeof knowledgeAccessScopeSchema>;

export function resolveKnowledgeAccessScope(input: {
  readonly organizationId: string;
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
  readonly collection?: string | undefined;
}): KnowledgeAccessScope {
  return knowledgeAccessScopeSchema.parse({
    organizationId: input.organizationId,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.agentVersionId ? { agentVersionId: input.agentVersionId } : {}),
    ...(input.collection ? { collection: input.collection } : {}),
  });
}
