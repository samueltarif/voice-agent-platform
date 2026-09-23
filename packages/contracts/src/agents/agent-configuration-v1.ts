import { z } from 'zod';

export const AGENT_CONFIGURATION_SCHEMA_VERSION_V1 = 1 as const;

export const agentPersonaV1Schema = z
  .object({
    role: z.string().min(1),
    companyName: z.string().min(1),
    objective: z.string().min(1),
    tone: z.enum(['FORMAL', 'CASUAL', 'EMPATHETIC', 'OBJECTIVE']),
    greetingPhrase: z.string().min(1),
    closingPhrase: z.string().min(1),
    fallbackPhrase: z.string().min(1),
  })
  .strict();

export const agentVoiceV1Schema = z
  .object({
    languageCode: z.enum(['pt-BR', 'en-US', 'es-ES']),
  })
  .strict();

export const agentDeterministicRulesV1Schema = z
  .object({
    maxDiscountPercent: z.number().min(0).max(100).optional(),
    operatingHours: z.string().min(1).optional(),
  })
  .strict();

export const agentRulesV1Schema = z
  .object({
    conversational: z.array(z.string().min(1)),
    deterministic: agentDeterministicRulesV1Schema,
  })
  .strict();

export const agentPlaybookStageV1Schema = z
  .object({
    name: z.string().min(1),
    goal: z.string().min(1),
  })
  .strict();

export const agentPlaybookV1Schema = z
  .object({
    stages: z.array(agentPlaybookStageV1Schema),
  })
  .strict();

export const agentExampleV1Schema = z
  .object({
    customerInput: z.string().min(1),
    idealAgentResponse: z.string().min(1),
  })
  .strict();

export const agentConfigurationSnapshotV1Schema = z
  .object({
    persona: agentPersonaV1Schema,
    voice: agentVoiceV1Schema,
    rules: agentRulesV1Schema,
    playbook: agentPlaybookV1Schema.optional(),
    examples: z.array(agentExampleV1Schema).optional(),
  })
  .strict();

export type AgentConfigurationSnapshotV1 = z.infer<typeof agentConfigurationSnapshotV1Schema>;
export type AgentPersonaV1 = z.infer<typeof agentPersonaV1Schema>;
export type AgentVoiceV1 = z.infer<typeof agentVoiceV1Schema>;
export type AgentRulesV1 = z.infer<typeof agentRulesV1Schema>;
export type AgentPlaybookV1 = z.infer<typeof agentPlaybookV1Schema>;
export type AgentExampleV1 = z.infer<typeof agentExampleV1Schema>;
