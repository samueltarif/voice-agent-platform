/**
 * E2-V (3ª rodada) — política de inatividade com recursos NATIVOS da Millis
 * (esquema `AgentConfig`, docs.millis.ai, consultado em 27/11/2026):
 * - `flow.inactivity_handling` = { idle_time (s), message }: após `idle_time`
 *   segundos sem fala do usuário, o agente diz `message`;
 * - `session_timeout.max_idle` (s) + `message`: tempo máximo sem entrada do
 *   usuário até a sessão terminar (o 2º experimento encerrou com status
 *   `timeout` ≈ 20 s após o último `idle`, com `max_idle: 20`);
 * - `flow.agent_terminate_call` = { enabled, instruction, messages }: o
 *   agente pode encerrar por conta própria — instruído a fazê-lo só quando o
 *   interlocutor se despede ou pede, NUNCA por silêncio.
 *
 * Política pedida: pergunta após 7 s; encerra após mais 7 s sem resposta;
 * fala do interlocutor reinicia a contagem. LACUNAS (não documentadas, a
 * medir no próximo experimento): se `max_idle` conta desde a última fala do
 * USUÁRIO (premissa: 7 + 7 = 14 s) ou se a pergunta do agente o reinicia
 * (aí o encerramento viria só ≈ 21 s); se `inactivity_handling` se repete;
 * se a contagem reinicia com qualquer fala do usuário (premissa da doc:
 * "inatividade do usuário"). Inatividade não é desinteresse comercial: o
 * encerramento por `timeout` é classificado como INATIVIDADE (correlate.mjs).
 */

export const DEFAULT_PROMPT = 'Você ainda está aí?';
export const DEFAULT_FAREWELL =
  'Como não ouvi resposta, vou encerrar por agora. Obrigado e até logo!';
export const TERMINATE_INSTRUCTION =
  'Encerre a ligação somente quando o interlocutor se despedir ou pedir para encerrar. ' +
  'Nunca encerre por causa de silêncio e nunca trate silêncio como falta de interesse: ' +
  'a inatividade é tratada automaticamente pela plataforma.';

function seconds(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 3 || n > 120) throw new Error(`${name}: entre 3 e 120 segundos`);
  return n;
}

export function applyInactivityPolicy(config, options = {}) {
  const promptAfter = seconds(options.promptAfterSeconds ?? 7, 'pergunta após');
  const endAfter = seconds(options.endAfterSeconds ?? 7, 'encerramento após');
  const farewell = options.farewellMessage?.trim() || DEFAULT_FAREWELL;
  return {
    ...config,
    flow: {
      ...(config.flow ?? {}),
      inactivity_handling: {
        idle_time: promptAfter,
        message: options.promptMessage?.trim() || DEFAULT_PROMPT,
      },
      agent_terminate_call: {
        enabled: true,
        instruction: TERMINATE_INSTRUCTION,
        messages: ['Obrigado pelo seu tempo. Até logo!'],
      },
    },
    session_timeout: {
      ...(config.session_timeout ?? {}),
      max_idle: promptAfter + endAfter,
      message: farewell,
    },
  };
}
