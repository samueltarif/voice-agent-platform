/**
 * E2-V (2ª etapa) — configuração DINÂMICA do agente da Millis.
 * Só se aplica a `agent_config` (com `agent_id` o SDK não aceita ajustes:
 * vale a configuração salva no painel). Cada ajuste preenchido substitui o
 * campo correspondente de uma CÓPIA; vazio mantém o que veio no JSON. Os
 * valores aceitos (modelos, vozes) são os do fornecedor — PROVIDER-UNVERIFIED
 * até a sessão real responder.
 */

const VOICE_PROVIDERS = ['elevenlabs', 'rime', 'openai', 'cartesia', 'playht'];

const filled = (value) => typeof value === 'string' && value.trim() !== '';

export function applyAgentOverrides(agentConfig, overrides = {}) {
  const out = { ...agentConfig };
  const { llmModel, voiceProvider, voiceId, language, firstMessage, prompt } = overrides;
  if (filled(llmModel)) out.llm = { ...(agentConfig.llm ?? {}), model: llmModel.trim() };
  if (filled(voiceProvider) || filled(voiceId)) {
    const voice = { ...(agentConfig.voice ?? {}) };
    if (filled(voiceProvider)) {
      if (!VOICE_PROVIDERS.includes(voiceProvider.trim())) {
        throw new Error(`provedor de voz desconhecido pelo SDK: ${voiceProvider}`);
      }
      voice.provider = voiceProvider.trim();
    }
    if (filled(voiceId)) voice.voice_id = voiceId.trim();
    out.voice = voice;
  }
  if (filled(language)) out.language = language.trim();
  if (filled(firstMessage)) out.first_message = firstMessage;
  if (filled(prompt)) out.prompt = prompt;
  return out;
}

/** Resumo sem segredos do que foi configurado (vai para o registro). */
export function describeAgent(agent) {
  if (typeof agent === 'string') return { mode: 'agent_id', agent_id: agent };
  return {
    mode: 'agent_config',
    llm: agent.llm?.model ?? null,
    voice: agent.voice ? { provider: agent.voice.provider, voice_id: agent.voice.voice_id } : null,
    language: agent.language ?? null,
    tools: (agent.tools ?? []).map((tool) => ({
      name: tool.name,
      response_mode: tool.response_mode ?? null,
      execute_after_message: tool.execute_after_message ?? null,
    })),
  };
}
