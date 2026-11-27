/**
 * E2-V (2ª etapa) — respostas SIMULADAS da consulta de agenda. Horários
 * fictícios, gerados a partir de uma data-base fixa (nunca da agenda real).
 */

export const SCENARIOS = Object.freeze(['success', 'unavailable', 'error', 'timeout']);

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
          status: 'OFFERED',
          fictitious: true,
          slots: FICTITIOUS_SLOTS,
          instructions: 'Horários de TESTE. Ofereça no máximo dois e não confirme reserva.',
        },
      };
    case 'unavailable':
      return { status: 200, body: { status: 'NO_AVAILABILITY', fictitious: true, slots: [] } };
    case 'error':
      return { status: 500, body: { status: 'ERROR', message: 'Falha simulada da agenda.' } };
    case 'timeout':
      return {
        status: 504,
        delayMs: timeoutMs,
        body: { status: 'TIMEOUT', message: 'Resposta tardia simulada.' },
      };
    default:
      throw new Error(`cenário desconhecido: ${scenario}`);
  }
}
