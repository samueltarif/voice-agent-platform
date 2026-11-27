/**
 * E2-V — opções nativas de uma ferramenta da Millis, conforme o esquema
 * `Function` da API de agentes (docs.millis.ai, consultado em 27/11/2026):
 * `method` (ex.: POST), `response_mode` (`strict` | `flexible`),
 * `execute_after_message` (executa só depois de terminar uma mensagem
 * predefinida), `messages` (falas predefinidas durante a execução) e
 * `timeout` (segundos até a função falhar). Cada opção só é enviada quando
 * definida — o experimento compara a presença e a ausência.
 */

export const RESPONSE_MODES = Object.freeze(['strict', 'flexible']);

export function applyToolOptions(tool, options = {}) {
  const { responseMode, executeAfterMessage, messages, timeoutSeconds } = options;
  const out = { ...tool, method: 'POST' };
  if (responseMode !== undefined && responseMode !== '') {
    if (!RESPONSE_MODES.includes(responseMode)) {
      throw new Error(`response_mode deve ser ${RESPONSE_MODES.join(' ou ')}`);
    }
    out.response_mode = responseMode;
  }
  const list = (messages ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (executeAfterMessage !== undefined) {
    if (executeAfterMessage && list.length === 0) {
      throw new Error('execute_after_message exige ao menos uma mensagem predefinida');
    }
    out.execute_after_message = Boolean(executeAfterMessage);
  }
  if (list.length > 0) out.messages = list;
  if (timeoutSeconds !== undefined && timeoutSeconds !== '') {
    const seconds = Number(timeoutSeconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
      throw new Error('timeout da ferramenta: inteiro entre 1 e 60 segundos');
    }
    out.timeout = seconds;
  }
  return out;
}
