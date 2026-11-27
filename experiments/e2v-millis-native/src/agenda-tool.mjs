/**
 * E2-V (2ª etapa) — ferramenta EXPERIMENTAL de consulta de agenda, chamada
 * pela Millis via webhook HTTPS (mecanismo nativo do fornecedor). O webhook é
 * o servidor experimental deste protótipo (`webhook/`), que devolve horários
 * FICTÍCIOS e não acessa serviços nem bancos da VAP.
 *
 * Autenticação: cabeçalho `x-e2v-token` (campo `header` da ferramenta no
 * SDK). O token é efêmero, digitado na página e nunca registrado.
 * `response_mode` / `execute_after_message`: só enviados se definidos
 * (PROVIDER-UNVERIFIED — objeto da investigação).
 */

export const AGENDA_TOOL_NAME = 'e2v_consultar_agenda';
export const AGENDA_TOOL_PATH = '/tool/e2v-agenda';
export const TOKEN_HEADER = 'x-e2v-token';

export function agendaWebhookUrl(baseUrl) {
  const url = new URL(AGENDA_TOOL_PATH, baseUrl);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1') {
    throw new Error('webhook deve ser HTTPS (ou 127.0.0.1 em teste local)');
  }
  return url.toString();
}

export function buildAgendaTool({ baseUrl, token, responseMode, executeAfterMessage }) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('token do webhook ausente ou curto (mínimo 32 caracteres)');
  }
  const tool = {
    name: AGENDA_TOOL_NAME,
    description:
      'TESTE E2-V. Consulta horários FICTÍCIOS de reunião. Use quando o interlocutor quiser ' +
      'saber horários disponíveis. Não marca nada.',
    webhook: agendaWebhookUrl(baseUrl),
    header: { [TOKEN_HEADER]: token },
    params: [
      {
        name: 'preferencia',
        type: 'string',
        description: 'Dia ou período desejado, nas palavras do interlocutor',
        required: false,
      },
    ],
  };
  if (responseMode !== undefined && responseMode !== '') tool.response_mode = responseMode;
  if (executeAfterMessage !== undefined) tool.execute_after_message = Boolean(executeAfterMessage);
  return tool;
}

export function withAgendaTool(agentConfig, options) {
  const tools = (agentConfig.tools ?? []).filter((tool) => tool?.name !== AGENDA_TOOL_NAME);
  return { ...agentConfig, tools: [...tools, buildAgendaTool(options)] };
}
