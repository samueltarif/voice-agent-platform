import { z } from 'zod';
import type { SchedulingAgentScope } from './scheduling-agent-port.js';

/**
 * E2 (DEC-075; simplificada pela DEC-077) — ferramentas do agente sobre o
 * LEAD da chamada. Lead, telefone e tenant vêm SÓ do contexto confiável
 * (concessão → sessão → tentativa → destino); o modelo não fornece ids.
 *
 * - `lead.record_opt_out`: supressão PREVENTIVA imediata (fail-safe), sem
 *   exigir evidência; a frase é guardada para a reconciliação pós-chamada,
 *   que também registra o opt-out que a ferramenta não registrou.
 * - `lead.record_outcome`: só PROPÕE o resultado. Ferramenta executada não
 *   prova interlocução: o resultado é aplicado na reconciliação pós-chamada,
 *   com evidência independente no histórico, pela matriz D5.
 */

export const LEAD_RECORD_OUTCOME_TOOL = 'lead.record_outcome' as const;
export const LEAD_RECORD_OPT_OUT_TOOL = 'lead.record_opt_out' as const;

/** Resultados que o agente PODE propor; sem resposta/falha técnica/timeout nunca são resultado. */
export const AGENT_CALL_OUTCOMES = ['CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'] as const;
export type AgentCallOutcome = (typeof AGENT_CALL_OUTCOMES)[number];

export const recordOutcomeArgumentsSchema = z
  .object({ outcome: z.enum(AGENT_CALL_OUTCOMES) })
  .strict();
export type RecordOutcomeArguments = z.infer<typeof recordOutcomeArgumentsSchema>;

/** A frase é registro para auditoria, nunca condição: a supressão acontece de qualquer forma. */
export const recordOptOutArgumentsSchema = z
  .object({ leadPhrase: z.string().trim().max(300).optional() })
  .strict();
export type RecordOptOutArguments = z.infer<typeof recordOptOutArgumentsSchema>;

export type LeadToolRefusal = 'CONTEXT_REFUSED' | 'SESSION_NOT_ACTIVE' | 'OPT_OUT_REQUESTED';

export type RecordOutcomeResult =
  /** Proposta guardada; aplicação só na reconciliação pós-chamada. */
  | { readonly status: 'PROPOSED'; readonly outcome: AgentCallOutcome }
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
  recordOptOut(
    scope: SchedulingAgentScope,
    args: RecordOptOutArguments,
  ): Promise<RecordOptOutResult>;
}
