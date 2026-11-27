/**
 * E2-V (2ª etapa) — respostas SIMULADAS da consulta de agenda. Horários
 * fictícios, gerados a partir de uma data-base fixa (nunca da agenda real).
 */

export const SCENARIOS = Object.freeze(['success', 'unavailable', 'error', 'error_200', 'timeout']);

/** Orientação textual devolvida junto com `result` (vocabulário da descrição da ferramenta). */
const FAILURE_GUIDANCE =
  'A consulta FALHOU. Isto NÃO significa falta de horários. Diga que não foi possível ' +
  'consultar a agenda agora e ofereça retornar depois.';

const FICTITIOUS_SLOTS = [
  { id: 'fict-1', label: 'terça-feira, 10h', start: '2026-12-01T10:00:00-03:00' },
  { id: 'fict-2', label: 'terça-feira, 15h30', start: '2026-12-01T15:30:00-03:00' },
  { id: 'fict-3', label: 'quarta-feira, 9h', start: '2026-12-02T09:00:00-03:00' },
];

export function scenarioResponse(scenario, { timeoutMs }) {
  switch (scenario) {
    case 'success':
      return {
        status: 200,
        body: {
          result: 'AVAILABLE',
          status: 'OFFERED',
          fictitious: true,
          slots: FICTITIOUS_SLOTS,
          instructions: 'Horários de TESTE. Ofereça no máximo dois e não confirme reserva.',
        },
      };
    case 'unavailable':
      return {
        status: 200,
        body: {
          result: 'NO_AVAILABILITY',
          status: 'NO_AVAILABILITY',
          fictitious: true,
          slots: [],
          instructions: 'Não há horários no período pedido. Ofereça consultar outro período.',
        },
      };
    case 'error':
      return {
        status: 500,
        body: { result: 'TECHNICAL_ERROR', status: 'ERROR', instructions: FAILURE_GUIDANCE },
      };
    // Variante: falha técnica com HTTP 200 — testa se a Millis só repassa o corpo de 2xx ao LLM.
    case 'error_200':
      return {
        status: 200,
        body: { result: 'TECHNICAL_ERROR', status: 'ERROR', instructions: FAILURE_GUIDANCE },
      };
    case 'timeout':
      return {
        status: 504,
        delayMs: timeoutMs,
        body: { result: 'TECHNICAL_ERROR', status: 'TIMEOUT', instructions: FAILURE_GUIDANCE },
      };
    default:
      throw new Error(`cenário desconhecido: ${scenario}`);
  }
}
