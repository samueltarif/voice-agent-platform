/**
 * E2-V — ferramenta EXPERIMENTAL sem efeito comercial real.
 *
 * A Millis chama ferramentas por webhook HTTPS (campo `webhook` do SDK).
 * Criar endpoint público é proibido nesta etapa; por isso o webhook aponta
 * para um domínio `.invalid` (RFC 6761: nunca resolve). O que se observa é se
 * e quando o motor decide chamar a ferramenta (eventos `ai_action`, texto e
 * áudio ao redor), não o efeito — que não existe.
 *
 * Opções nativas (`method`, `response_mode`, `execute_after_message`,
 * `messages`, `timeout`): `tool-options.mjs`.
 */

import { applyToolOptions } from './tool-options.mjs';

export const EXPERIMENTAL_TOOL_NAME = 'e2v_registrar_interesse_teste';
export const NOOP_WEBHOOK = 'https://e2v-tool.invalid/noop';

export function buildExperimentalTool(options = {}) {
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
  return applyToolOptions(tool, options);
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
