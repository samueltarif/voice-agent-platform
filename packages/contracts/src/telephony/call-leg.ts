import { z } from 'zod';

/**
 * 008-OF5a (S1) — Pernas de uma tentativa, com nomes neutros (DEC-045):
 * - `CONTACT_LEG`: perna telefônica com o contato;
 * - `AI_AGENT_LEG`: perna do motor conversacional;
 * - `HUMAN_AGENT_LEG`: RESERVADA para a futura transferência (sem fluxo na S1).
 * O mapeamento para identificadores do fornecedor existe só no adaptador.
 */
export const CALL_LEG_ROLES = ['CONTACT_LEG', 'AI_AGENT_LEG', 'HUMAN_AGENT_LEG'] as const;
export const callLegRoleSchema = z.enum(CALL_LEG_ROLES);
export type CallLegRole = z.infer<typeof callLegRoleSchema>;

export const CALL_LEG_STATES = [
  'INITIATED',
  'RINGING',
  'ANSWERED',
  'COMPLETED',
  'FAILED',
  'BUSY',
  'NO_ANSWER',
  'CANCELED',
] as const;
export const callLegStateSchema = z.enum(CALL_LEG_STATES);
export type CallLegState = z.infer<typeof callLegStateSchema>;

export const TERMINAL_CALL_LEG_STATES: ReadonlySet<CallLegState> = new Set([
  'COMPLETED',
  'FAILED',
  'BUSY',
  'NO_ANSWER',
  'CANCELED',
]);

/** Ordem monotônica: um evento só avança; nunca regride (eventos fora de ordem). */
const CALL_LEG_STATE_RANK: Readonly<Record<CallLegState, number>> = {
  INITIATED: 0,
  RINGING: 1,
  ANSWERED: 2,
  COMPLETED: 3,
  FAILED: 3,
  BUSY: 3,
  NO_ANSWER: 3,
  CANCELED: 3,
};

export function isTerminalCallLegState(state: CallLegState): boolean {
  return TERMINAL_CALL_LEG_STATES.has(state);
}

/** `true` só quando `next` avança em relação a `current` (terminal nunca avança). */
export function isCallLegStateAdvance(current: CallLegState, next: CallLegState): boolean {
  if (isTerminalCallLegState(current)) return false;
  return CALL_LEG_STATE_RANK[next] > CALL_LEG_STATE_RANK[current];
}

/** Referência opaca da perna no fornecedor: não confiável, nunca identifica o tenant. */
export const providerLegReferenceSchema = z.string().trim().min(1).max(128);

export interface CallLeg {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly role: CallLegRole;
  readonly providerLegReference: string;
  readonly parentLegReference: string | null;
  readonly state: CallLegState;
  /** Último número de sequência aplicado (`null` quando o fornecedor não envia). */
  readonly lastSequence: number | null;
}
