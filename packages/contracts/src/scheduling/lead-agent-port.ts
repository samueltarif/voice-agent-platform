import { z } from 'zod';
import type { SchedulingAgentScope } from './scheduling-agent-port.js';

/**
 * E2 PR 3 (DEC-075, D2/D5) — ferramentas do agente sobre o LEAD da chamada.
 * O lead, o telefone e o tenant vêm SÓ do contexto confiável (concessão →
 * sessão → tentativa → destino); o modelo não fornece ids.
 *
 * - `lead.record_outcome`: resultado comercial (origem `CALL_OUTCOME`), sem
 *   nunca sair de `DO_NOT_CALL` nem tocar `MEETING_SCHEDULED`.
 * - `lead.record_opt_out`: só CONCLUI ou RECUPERA um pedido que o servidor
 *   reconheceu na fala do interlocutor nesta sessão (evidência do protocolo);
 *   nunca suprime sem essa evidência (auditoria consolidada A2). O caminho
 *   obrigatório é automático, na fala final (`recordLeadUtterance`).
 */

export const LEAD_RECORD_OUTCOME_TOOL = 'lead.record_outcome' as const;
export const LEAD_RECORD_OPT_OUT_TOOL = 'lead.record_opt_out' as const;

/** Resultados que o agente PODE registrar; sem resposta/falha técnica não são resultado do agente. */
export const AGENT_CALL_OUTCOMES = ['CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'] as const;
export type AgentCallOutcome = (typeof AGENT_CALL_OUTCOMES)[number];

export const recordOutcomeArgumentsSchema = z
  .object({ outcome: z.enum(AGENT_CALL_OUTCOMES) })
  .strict();
export type RecordOutcomeArguments = z.infer<typeof recordOutcomeArgumentsSchema>;

export const recordOptOutArgumentsSchema = z.object({}).strict();
export type RecordOptOutArguments = z.infer<typeof recordOptOutArgumentsSchema>;

export type LeadToolRefusal =
  | 'CONTEXT_REFUSED'
  /** A2: a ferramenta só conclui ou recupera um pedido RECONHECIDO pelo servidor nesta sessão. */
  | 'NO_OPT_OUT_EVIDENCE'
  /** A7: resultado comercial exige interlocução confiável (fala final processada) nesta sessão. */
  | 'NO_INTERLOCUTION'
  | 'NO_LEAD_FOR_DESTINATION'
  | 'SESSION_NOT_ACTIVE'
  | 'OPT_OUT_REQUESTED'
  | 'OPT_OUT_CLARIFICATION_PENDING'
  | 'MEETING_PRESERVED'
  | 'LEAD_DO_NOT_CALL'
  | 'TRANSITION_NOT_ALLOWED';

export type RecordOutcomeResult =
  | { readonly status: 'RECORDED' | 'ALREADY_RECORDED'; readonly outcome: AgentCallOutcome }
  | { readonly status: 'REFUSED'; readonly reason: LeadToolRefusal };

export type RecordOptOutResult =
  | {
      readonly status: 'RECORDED';
      /** Reunião ativa preservada (E1); o telefone fica suprimido do mesmo jeito. */
      readonly meetingPreserved: boolean;
      readonly speech: string;
    }
  | { readonly status: 'REFUSED'; readonly reason: LeadToolRefusal; readonly speech: string };

export interface LeadAgentPort {
  recordOutcome(
    scope: SchedulingAgentScope,
    args: RecordOutcomeArguments,
  ): Promise<RecordOutcomeResult>;
  recordOptOut(scope: SchedulingAgentScope): Promise<RecordOptOutResult>;
}
