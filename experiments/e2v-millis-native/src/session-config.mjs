/**
 * E2-V — montagem da inicialização da sessão nativa da Millis.
 * Formato observado no SDK oficial (@millisai/web-sdk 1.0.12) e no
 * jambonz/millisai-audio-socket: {method:'initiate', data:{agent, public_key,
 * metadata, include_metadata_in_prompt}}. O próprio SDK envia essa mensagem;
 * aqui só se valida e se monta o que é passado a `client.start(...)`.
 * Campos do fornecedor não verificados ficam marcados como PROVIDER-UNVERIFIED.
 */

export const MILLIS_NATIVE_ENDPOINT = 'wss://api-west.millis.ai:8080/millis';
export const EXPERIMENT_TAG = 'E2-V';

const AGENT_ID = /^[A-Za-z0-9_-]{4,128}$/;

/** Metadados EXCLUSIVOS por sessão: nunca reaproveitados entre tentativas. */
export function newSessionMetadata({ now = new Date(), uuid = () => crypto.randomUUID() } = {}) {
  return {
    experiment: EXPERIMENT_TAG,
    session_id: `e2v-${uuid()}`,
    started_at: now.toISOString(),
    commercial_effects: 'NONE',
  };
}

function parseAgentConfig(raw) {
  let config;
  try {
    config = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('agent_config não é JSON válido');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('agent_config deve ser um objeto');
  }
  if (typeof config.prompt !== 'string' || !config.prompt.trim()) {
    throw new Error('agent_config.prompt é obrigatório');
  }
  if (!config.voice || typeof config.voice.voice_id !== 'string') {
    throw new Error('agent_config.voice.voice_id é obrigatório');
  }
  return config;
}

/**
 * Devolve o primeiro argumento de `client.start`: string (agent_id) ou objeto
 * (agent_config). Exatamente um dos dois.
 */
export function resolveAgent({ agentId, agentConfig }) {
  const hasId = typeof agentId === 'string' && agentId.trim() !== '';
  const hasConfig = agentConfig !== undefined && agentConfig !== null && agentConfig !== '';
  if (hasId === hasConfig) throw new Error('Informe agent_id OU agent_config (exatamente um)');
  if (hasId) {
    const id = agentId.trim();
    if (!AGENT_ID.test(id)) throw new Error('agent_id com formato inesperado');
    return id;
  }
  return parseAgentConfig(agentConfig);
}

/** Espelho, para testes e para o registro, da mensagem que o SDK envia. */
export function describeInitiate({ agent, metadata, includeMetadataInPrompt }) {
  return {
    method: 'initiate',
    data: {
      agent: typeof agent === 'string' ? { agent_id: agent } : { agent_config: agent },
      public_key: '[REDACTED]',
      metadata,
      include_metadata_in_prompt: Boolean(includeMetadataInPrompt),
    },
  };
}
