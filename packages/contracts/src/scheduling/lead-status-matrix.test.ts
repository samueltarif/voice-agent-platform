import { describe, expect, it } from 'vitest';
import {
  evaluateLeadStatusChange,
  LEAD_STATUSES,
  type LeadStatusChangeBlockReason,
  type LeadStatusChangeOrigin,
} from './lead-status.js';

/**
 * 2ª auditoria E1 — matriz COMPLETA (6 × 6 × 5 = 180 células; E2 PR 3 acrescentou `CALL_OUTCOME`) das transições
 * comerciais sob a regra de opt-out, escrita de forma independente da
 * implementação. Colunas na ordem de `LEAD_STATUSES`:
 * NEW, CONTACTED, QUALIFIED, MEETING_SCHEDULED, NOT_INTERESTED, DO_NOT_CALL.
 *   O = permitido   S = SAME_STATUS   T = TRANSITION_NOT_ALLOWED
 *   M = STATUS_MANAGED_BY_SCHEDULING  D = LEAD_DO_NOT_CALL
 *   P = ACTIVE_MEETING_PRESERVED (opt-out preserva a reunião; a supressão é
 *       gravada pelo serviço de qualquer forma)
 */
const MATRIX: Record<Exclude<LeadStatusChangeOrigin, 'CREATED'>, readonly string[]> = {
  MANUAL: [
    'S O O M O T', // NEW: DO_NOT_CALL manual vira opt-out no serviço, não aqui
    'T S O M O T', // CONTACTED
    'T O S M O T', // QUALIFIED
    'M M M S M M', // MEETING_SCHEDULED: só reserva/cancelamento mexem
    'T O O M S T', // NOT_INTERESTED
    'D D D D D S', // DO_NOT_CALL: mudança manual nunca reabre
  ],
  OPT_OUT: [
    'S T T T T O',
    'T S T T T O',
    'T T S T T O',
    'T T T S T P',
    'T T T T S O',
    'T T T T T S',
  ],
  MEETING_BOOKED: [
    'S T T O T T',
    'T S T O T T',
    'T T S O T T',
    'T T T S T T',
    'T T T O S T',
    'T T T O T S', // reserva MANUAL pedida pelo cliente; agente é barrado antes
  ],
  MEETING_CANCELED: [
    'S T T T T T',
    'T S T T T T',
    'T T S T T T',
    'T T O S T O', // volta a QUALIFIED, ou a DO_NOT_CALL com telefone suprimido
    'T T T T S T',
    'T T T T T S',
  ],
  // TEST_CHANGE_REASON (E2 PR 3, D5): nova origem `CALL_OUTCOME` — linhas acrescentadas;
  // as 144 células anteriores não mudaram. Resultado do agente só avança entre abertos.
  CALL_OUTCOME: [
    'S O O T O T', // NEW
    'T S O T O T', // CONTACTED: nunca volta a NEW
    'T T S T O T', // QUALIFIED: não rebaixa para CONTACTED
    'P P P S P P', // MEETING_SCHEDULED: reunião preservada
    'T T O T S T', // NOT_INTERESTED: pode ser requalificado na conversa
    'D D D D D S', // DO_NOT_CALL: nunca reaberto pelo agente
  ],
};

const REASON: Record<string, LeadStatusChangeBlockReason> = {
  S: 'SAME_STATUS',
  T: 'TRANSITION_NOT_ALLOWED',
  M: 'STATUS_MANAGED_BY_SCHEDULING',
  D: 'LEAD_DO_NOT_CALL',
  P: 'ACTIVE_MEETING_PRESERVED',
};

describe('E1 lead status — full transition matrix under the opt-out rule', () => {
  for (const [origin, rows] of Object.entries(MATRIX)) {
    it(`${origin}: every (from, to) cell matches the specification`, () => {
      const mismatches: string[] = [];
      LEAD_STATUSES.forEach((from, i) => {
        const cells = rows[i]!.split(' ');
        expect(cells).toHaveLength(LEAD_STATUSES.length);
        LEAD_STATUSES.forEach((to, j) => {
          const expected =
            cells[j] === 'O' ? { ok: true } : { ok: false, reason: REASON[cells[j]!] };
          const actual = evaluateLeadStatusChange({
            from,
            to,
            origin: origin as keyof typeof MATRIX,
          });
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push(`${from}→${to}: ${JSON.stringify(actual)}`);
          }
        });
      });
      expect(mismatches).toEqual([]);
    });
  }
});
