/**
 * E2-V (2ª etapa) — ferramenta EXPERIMENTAL de consulta de agenda, chamada
 * pela Millis via webhook HTTPS (mecanismo nativo do fornecedor). O webhook é
 * o servidor experimental deste protótipo (`webhook/`), que devolve horários
 * FICTÍCIOS e não acessa serviços nem bancos da VAP.
 *
 * Autenticação: cabeçalho `x-e2v-token` (campo `header` da ferramenta no
 * SDK). O token é efêmero, digitado na página e nunca registrado.
 * Opções nativas (`method`, `response_mode`, `execute_after_message`,
 * `messages`, `timeout`): `tool-options.mjs` — esquema documentado; o
 * EFEITO de cada uma é o objeto da investigação.
 */

import { applyToolOptions } from './tool-options.mjs';

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

/**
 * Instruções de uso (3ª rodada): no 2º experimento um HTTP 404 foi falado como
 * "sem horários". A descrição separa explicitamente os três desfechos; o
 * webhook devolve `result` com o mesmo vocabulário.
 */
export const AGENDA_TOOL_DESCRIPTION = [
  'TESTE E2-V. Consulta horários FICTÍCIOS de reunião; não marca nada.',
  'Use quando o interlocutor quiser saber horários disponíveis.',
  'Leia o campo "result" da resposta:',
  '"AVAILABLE" = ofereça no máximo dois dos horários listados, sem confirmar reserva;',
  '"NO_AVAILABILITY" = não há horários no período pedido; ofereça consultar outro período;',
  '"TECHNICAL_ERROR" ou qualquer falha, erro, resposta vazia ou demora da ferramenta =',
  'diga que não conseguiu consultar a agenda agora e ofereça retornar depois.',
  'NUNCA diga que não há horários quando a consulta falhar.',
].join(' ');

export function buildAgendaTool({ baseUrl, token, ...options }) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('token do webhook ausente ou curto (mínimo 32 caracteres)');
  }
  const tool = {
    name: AGENDA_TOOL_NAME,
    description: AGENDA_TOOL_DESCRIPTION,
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
  return applyToolOptions(tool, options);
}

export function withAgendaTool(agentConfig, options) {
  const tools = (agentConfig.tools ?? []).filter((tool) => tool?.name !== AGENDA_TOOL_NAME);
  return { ...agentConfig, tools: [...tools, buildAgendaTool(options)] };
}

export const REPORT_PATH = '/session/e2v-report';

/** URL do relatório pós-chamada (`session_data_webhook`), com o token efêmero na query. */
export function sessionReportUrl(baseUrl, token) {
  const url = new URL(agendaWebhookUrl(baseUrl));
  url.pathname = REPORT_PATH;
  url.searchParams.set('t', token);
  return url.toString();
}
