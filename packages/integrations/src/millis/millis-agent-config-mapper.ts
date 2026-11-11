import {
  agentConfigurationSnapshotV1Schema,
  composeConversationGuidance,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { renderMillisPrompt } from './millis-agent-prompt.js';

/**
 * 008-MVP3 — Mapeamento DETERMINÍSTICO e server-side do snapshot PUBLICADO do
 * Agent Studio para o `agent_config` da Millis, só com campos documentados no
 * OpenAPI (`prompt`, `first_message`, `language`, `session_timeout`). Nada é
 * descartado em silêncio: cada campo de origem sai com um status no relatório.
 *
 * Fora do mapeamento, por decisão de segurança:
 * - `tools`: a Millis executa funções por webhook com cabeçalhos estáticos;
 *   expor ferramentas exigiria webhook público e autenticação forte (bloqueados).
 *   Presença no toolset NUNCA concede autoridade (DEC-047/DEC-048).
 * - regras determinísticas (desconto, horário): permanecem no servidor; o
 *   cartão de descontos NÃO está autorizado.
 * - voz (`voice`): sem equivalência verificada; fica o padrão do agente Millis.
 */
export type FieldMappingStatus =
  | 'MAPPED'
  | 'MAPPED_TO_PROMPT'
  | 'NOT_SUPPORTED'
  | 'NOT_VERIFIED'
  | 'SERVER_SIDE_ONLY'
  | 'NOT_EXPOSED';

export interface FieldMappingEntry {
  readonly source: string;
  readonly target: string | null;
  readonly status: FieldMappingStatus;
}

export interface PublishedAgentVersion {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  readonly configuration: unknown;
}

export interface MillisMappingRequest {
  readonly organizationId: string;
  readonly agentVersionId: string;
  /** Duração máxima da sessão (s), a mesma usada no `timeLimit` da telefonia. */
  readonly maxDurationSeconds: number;
}

export type MillisMappingResult =
  | {
      readonly kind: 'MAPPED';
      readonly agentConfig: Readonly<Record<string, unknown>>;
      readonly report: readonly FieldMappingEntry[];
    }
  | {
      readonly kind: 'REFUSED';
      readonly reason:
        'NOT_PUBLISHED' | 'TENANT_MISMATCH' | 'INVALID_SNAPSHOT' | 'LANGUAGE_NOT_SUPPORTED';
    };

/** Valores do enum `Language` do OpenAPI da Millis que existem no Agent Studio. */
const MILLIS_LANGUAGES: Readonly<Record<string, string>> = { 'pt-BR': 'pt-BR', 'en-US': 'en-US' };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function buildReport(snapshot: AgentConfigurationSnapshotV1): FieldMappingEntry[] {
  const deterministic = Object.keys(snapshot.rules.deterministic).map((key) => ({
    source: `rules.deterministic.${key}`,
    target: null,
    status: 'SERVER_SIDE_ONLY' as const,
  }));
  const tools = (snapshot.tools ?? []).map((tool) => ({
    source: `tools.${tool}`,
    target: null,
    status: 'NOT_EXPOSED' as const,
  }));
  return [
    { source: 'persona', target: 'prompt', status: 'MAPPED_TO_PROMPT' },
    { source: 'rules.conversational', target: 'prompt', status: 'MAPPED_TO_PROMPT' },
    { source: 'playbook', target: 'prompt', status: 'MAPPED_TO_PROMPT' },
    { source: 'examples', target: 'prompt', status: 'MAPPED_TO_PROMPT' },
    { source: 'persona.greetingPhrase', target: 'first_message', status: 'MAPPED' },
    { source: 'voice.languageCode', target: 'language', status: 'MAPPED' },
    { source: 'voice (timbre)', target: 'voice', status: 'NOT_VERIFIED' },
    ...deterministic,
    ...tools,
  ];
}

export function mapPublishedAgentToMillis(
  version: PublishedAgentVersion,
  request: MillisMappingRequest,
): MillisMappingResult {
  if (version.organizationId !== request.organizationId)
    return { kind: 'REFUSED', reason: 'TENANT_MISMATCH' };
  if (version.agentVersionId !== request.agentVersionId)
    return { kind: 'REFUSED', reason: 'TENANT_MISMATCH' };
  if (version.status !== 'PUBLISHED') return { kind: 'REFUSED', reason: 'NOT_PUBLISHED' };
  const parsed = agentConfigurationSnapshotV1Schema.safeParse(version.configuration);
  if (!parsed.success) return { kind: 'REFUSED', reason: 'INVALID_SNAPSHOT' };
  const snapshot = parsed.data;
  const language = MILLIS_LANGUAGES[snapshot.voice.languageCode];
  if (!language) return { kind: 'REFUSED', reason: 'LANGUAGE_NOT_SUPPORTED' };
  const { guidance } = composeConversationGuidance(snapshot);
  const agentConfig = deepFreeze({
    prompt: renderMillisPrompt(snapshot, guidance),
    first_message: snapshot.persona.greetingPhrase,
    language,
    session_timeout: { max_duration: request.maxDurationSeconds },
  });
  return { kind: 'MAPPED', agentConfig, report: deepFreeze(buildReport(snapshot)) };
}
