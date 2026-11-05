import type {
  AgentConfigurationSnapshotV1,
  AgentExampleV1,
  AgentPlaybookV1,
} from '../agents/agent-configuration-v1.js';
import type {
  ConversationGuidanceExample,
  ConversationGuidancePlaybook,
  ConversationGuidanceStage,
} from './conversation-context-contracts.js';

/**
 * AS1a — Roteiro (`playbook.stages`) e exemplos (`examples`) da versão publicada
 * levados ao contexto do motor de conversação OFFLINE.
 *
 * Limites determinísticos aplicados só na composição: a configuração armazenada
 * nunca é alterada nem truncada, e o schema V1 publicado não muda (nenhum `max`).
 * O texto é achatado numa linha (quebras e caracteres de controle viram espaço)
 * para não forjar cabeçalhos ou mensagens no prompt. Isso REDUZ, mas não elimina,
 * o risco de prompt injection: etapas e exemplos são dados do tenant, nunca
 * autorização para mudar regras ou políticas superiores.
 */
export const CONVERSATION_GUIDANCE_LIMITS = {
  maxStages: 12,
  maxExamples: 8,
  maxStageFieldChars: 300,
  maxExampleFieldChars: 600,
} as const;

export const CONVERSATION_GUIDANCE_TRUNCATION_MARK = '…';

type AgentPlaybookStage = AgentPlaybookV1['stages'][number];

export interface ConversationGuidance {
  readonly playbook?: ConversationGuidancePlaybook | undefined;
  readonly examples?: readonly ConversationGuidanceExample[] | undefined;
}

/** Somente contagens: seguro para logs (nenhum texto de etapa ou exemplo). */
export interface ConversationGuidanceStats {
  readonly stagesIncluded: number;
  readonly stagesOmitted: number;
  readonly examplesIncluded: number;
  readonly examplesOmitted: number;
  readonly fieldsTruncated: number;
}

// eslint-disable-next-line no-control-regex
const CONTROL_AND_BREAKS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

function normalizeField(raw: string, maxChars: number): { text: string; truncated: boolean } {
  const flat = raw.replace(CONTROL_AND_BREAKS, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= maxChars) return { text: flat, truncated: false };
  const kept = chars
    .slice(0, maxChars - 1)
    .join('')
    .trimEnd();
  return { text: `${kept}${CONVERSATION_GUIDANCE_TRUNCATION_MARK}`, truncated: true };
}

function boundItems<T, R>(
  items: readonly T[] | undefined,
  max: number,
  map: (item: T, onTruncate: () => void) => R,
) {
  const source = items ?? [];
  let truncated = 0;
  const included = source.slice(0, max).map((item) => map(item, () => (truncated += 1)));
  return { included, omitted: Math.max(0, source.length - max), truncated };
}

export function composeConversationGuidance(snapshot: AgentConfigurationSnapshotV1): {
  readonly guidance: ConversationGuidance;
  readonly stats: ConversationGuidanceStats;
} {
  const limits = CONVERSATION_GUIDANCE_LIMITS;
  const field = (raw: string, max: number, onTruncate: () => void) => {
    const result = normalizeField(raw, max);
    if (result.truncated) onTruncate();
    return result.text;
  };
  const stages = boundItems<AgentPlaybookStage, ConversationGuidanceStage>(
    snapshot.playbook?.stages,
    limits.maxStages,
    (stage, t) => ({
      name: field(stage.name, limits.maxStageFieldChars, t),
      goal: field(stage.goal, limits.maxStageFieldChars, t),
    }),
  );
  const examples = boundItems<AgentExampleV1, ConversationGuidanceExample>(
    snapshot.examples,
    limits.maxExamples,
    (example, t) => ({
      customerInput: field(example.customerInput, limits.maxExampleFieldChars, t),
      idealAgentResponse: field(example.idealAgentResponse, limits.maxExampleFieldChars, t),
    }),
  );
  return {
    guidance: {
      ...(stages.included.length > 0 ? { playbook: { stages: stages.included } } : {}),
      ...(examples.included.length > 0 ? { examples: examples.included } : {}),
    },
    stats: {
      stagesIncluded: stages.included.length,
      stagesOmitted: stages.omitted,
      examplesIncluded: examples.included.length,
      examplesOmitted: examples.omitted,
      fieldsTruncated: stages.truncated + examples.truncated,
    },
  };
}
