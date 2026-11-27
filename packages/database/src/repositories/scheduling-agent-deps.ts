import type { SchedulingSessionContextPort } from '@voice-agent/contracts';
import type { DatabaseInstance } from '../client/connection.js';

/** E2 (DEC-075/DEC-077) — dependências comuns dos serviços do agente (sem estado). */
export interface SchedulingEventDeps {
  readonly db: DatabaseInstance;
  readonly resolver: SchedulingSessionContextPort;
  readonly clock: () => Date;
}

/**
 * Ordem GLOBAL de travas da E2 simplificada (desenho §4):
 * K (chave de idempotência) → L (lead) → C (agenda) → O (oferta) →
 * A (tentativa) → S (sessão + estado do protocolo) → I (intenção de
 * agendamento) → R (reconciliação pós-chamada) → P (telefone, sempre por
 * último). Nenhum caminho pega uma trava anterior depois de uma posterior.
 */
export const E2_LOCK_ORDER = ['K', 'L', 'C', 'O', 'A', 'S', 'I', 'R', 'P'] as const;
