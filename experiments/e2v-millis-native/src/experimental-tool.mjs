/**
 * E2-V — ferramenta EXPERIMENTAL sem efeito comercial real.
 *
 * A Millis chama ferramentas por webhook HTTPS (campo `webhook` do SDK).
 * Criar endpoint público é proibido nesta etapa; por isso o webhook aponta
 * para um domínio `.invalid` (RFC 6761: nunca resolve). O que se observa é se
 * e quando o motor decide chamar a ferramenta (eventos `ai_action`, texto e
 * áudio ao redor), não o efeito — que não existe.
 *
 * `response_mode` e `execute_after_message` são PROVIDER-UNVERIFIED: nomes e
 * valores vêm do pedido do operador e devem ser conferidos na documentação e
 * no comportamento real. São repassados sem interpretação, só quando
 * definidos, para que o experimento compare as variantes.
 */

export const EXPERIMENTAL_TOOL_NAME = 'e2v_registrar_interesse_teste';
export const NOOP_WEBHOOK = 'https://e2v-tool.invalid/noop';

export function buildExperimentalTool({ responseMode, executeAfterMessage } = {}) {
  const tool = {
    name: EXPERIMENTAL_TOOL_NAME,
    description:
      'TESTE E2-V. Chame somente quando o interlocutor disser claramente que quer receber um ' +
      'contato de teste. Não marca reunião, não grava dados e não tem efeito real.',
    webhook: NOOP_WEBHOOK,
    header: {},
    params: [
      {
        name: 'confirmacao',
        type: 'string',
        description: 'Frase do interlocutor que motivou a chamada',
        required: true,
      },
    ],
  };
  if (responseMode !== undefined && responseMode !== '') tool.response_mode = responseMode;
  if (executeAfterMessage !== undefined) tool.execute_after_message = Boolean(executeAfterMessage);
  return tool;
}

/** Acrescenta a ferramenta a uma cópia do agent_config (nunca muta a entrada). */
export function withExperimentalTool(agentConfig, options) {
  const tools = Array.isArray(agentConfig.tools) ? agentConfig.tools : [];
  const others = tools.filter((tool) => tool?.name !== EXPERIMENTAL_TOOL_NAME);
  return { ...agentConfig, tools: [...others, buildExperimentalTool(options)] };
}

/** Resposta fixa usada só pelo mock local dos testes. */
export function noopToolResult() {
  return { ok: true, effect: 'NONE', message: 'Teste registrado sem efeito.' };
}
