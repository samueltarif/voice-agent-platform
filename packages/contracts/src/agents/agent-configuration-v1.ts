import { z } from 'zod';

export const AGENT_CONFIGURATION_SCHEMA_VERSION_V1 = 1 as const;

export const CANONICAL_TOOL_NAMES = [
  'agent.operating_hours',
  'catalog.search',
  'catalog.item_detail',
  // DEC-056: ampliação compatível — snapshots antigos continuam válidos e não ganham a ferramenta.
  'knowledge.search',
  // E2 PR 2 (DEC-075): agendamento pelo agente. Snapshots antigos não ganham as ferramentas;
  // a publicação exige o par completo e agenda válida (`evaluateSchedulingToolset`).
  'scheduling.find_slots',
  'scheduling.confirm_offer',
] as const;
export type CanonicalToolName = (typeof CANONICAL_TOOL_NAMES)[number];

export const canonicalToolNameSchema = z.enum(CANONICAL_TOOL_NAMES);

export const agentToolsV1Schema = z
  .array(canonicalToolNameSchema)
  .refine((tools) => new Set(tools).size === tools.length, {
    message: 'Duplicate tool identities are not allowed',
  });

export function normalizeCanonicalToolNames(tools: readonly string[]): CanonicalToolName[] {
  const unique = Array.from(new Set(tools));
  return unique.filter((t): t is CanonicalToolName =>
    (CANONICAL_TOOL_NAMES as readonly string[]).includes(t),
  );
}

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

/**
 * B2a (DEC-071): perfil de busca da Base de Conhecimento gravado na versão.
 * AUSENTE = `v1` (todas as versões existentes, inclusive as publicadas). Só
 * organizações liberadas pela plataforma podem gravar o campo; publicar ou
 * executar `v2` exige também a chave global de execução (ambas desligadas).
 */
export const AGENT_KNOWLEDGE_RETRIEVAL_PROFILES = ['v1', 'v2'] as const;
export type AgentKnowledgeRetrievalProfile = (typeof AGENT_KNOWLEDGE_RETRIEVAL_PROFILES)[number];

export const agentKnowledgeConfigurationV1Schema = z
  .object({
    retrievalProfile: z.enum(AGENT_KNOWLEDGE_RETRIEVAL_PROFILES),
  })
  .strict();

/**
 * E2 PR 1 (DEC-075, D1): agenda configurada NA VERSÃO publicada (2ª na
 * prioridade, depois da campanha). AUSENTE em todas as versões existentes —
 * snapshots antigos continuam válidos e sem agenda. O id é só configuração:
 * a resolução no servidor bloqueia agenda inexistente ou de outro tenant.
 */
export const agentSchedulingConfigurationV1Schema = z
  .object({
    calendarId: z.string().uuid(),
  })
  .strict();

export const agentConfigurationSnapshotV1Schema = z
  .object({
    persona: agentPersonaV1Schema,
    voice: agentVoiceV1Schema,
    rules: agentRulesV1Schema,
    playbook: agentPlaybookV1Schema.optional(),
    examples: z.array(agentExampleV1Schema).optional(),
    tools: agentToolsV1Schema.optional(),
    knowledge: agentKnowledgeConfigurationV1Schema.optional(),
    scheduling: agentSchedulingConfigurationV1Schema.optional(),
  })
  .strict();

export type AgentConfigurationSnapshotV1 = z.infer<typeof agentConfigurationSnapshotV1Schema>;
export type AgentPersonaV1 = z.infer<typeof agentPersonaV1Schema>;
export type AgentVoiceV1 = z.infer<typeof agentVoiceV1Schema>;
export type AgentRulesV1 = z.infer<typeof agentRulesV1Schema>;
export type AgentPlaybookV1 = z.infer<typeof agentPlaybookV1Schema>;
export type AgentExampleV1 = z.infer<typeof agentExampleV1Schema>;
export type AgentToolsV1 = z.infer<typeof agentToolsV1Schema>;
export type AgentKnowledgeConfigurationV1 = z.infer<typeof agentKnowledgeConfigurationV1Schema>;
export type AgentSchedulingConfigurationV1 = z.infer<typeof agentSchedulingConfigurationV1Schema>;
