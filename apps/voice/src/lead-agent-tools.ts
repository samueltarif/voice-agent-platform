import {
  createZodToolValidator,
  LEAD_RECORD_OPT_OUT_TOOL,
  LEAD_RECORD_OUTCOME_TOOL,
  recordOptOutArgumentsSchema,
  recordOutcomeArgumentsSchema,
  type LeadAgentPort,
  type RecordOptOutArguments,
  type RecordOptOutResult,
  type RecordOutcomeArguments,
  type RecordOutcomeResult,
  type ToolDefinition,
} from '@voice-agent/contracts';
import type { PublishedToolGrant } from './published-tool-grant.js';
import { assertGrantContext, schedulingScopeForGrant } from './scheduling-agent-tools.js';

/**
 * E2 PR 3 (DEC-075, D2/D5) — `lead.record_outcome` e `lead.record_opt_out`,
 * ligadas a uma concessão legítima. Lead, telefone e tenant vêm só do
 * contexto confiável; o modelo informa apenas o resultado (lista fechada).
 * O opt-out DITO pelo interlocutor é gravado pelo servidor na fala final,
 * com ou sem esta ferramenta. Nada aqui entra em composição de produção.
 */
export function createLeadToolDefinitions(
  grant: PublishedToolGrant,
  port: LeadAgentPort,
): readonly [
  ToolDefinition<RecordOutcomeArguments, RecordOutcomeResult>,
  ToolDefinition<RecordOptOutArguments, RecordOptOutResult>,
] {
  const scope = schedulingScopeForGrant(grant);
  return [
    {
      name: LEAD_RECORD_OUTCOME_TOOL,
      description:
        'Registra o resultado comercial da conversa (CONTACTED, QUALIFIED ou NOT_INTERESTED). Não use para ausência de resposta ou falha técnica.',
      validateInput: createZodToolValidator(recordOutcomeArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.recordOutcome(scope, input);
      },
    },
    {
      name: LEAD_RECORD_OPT_OUT_TOOL,
      description:
        'Registra que a pessoa não quer mais receber ligações (supressão do telefone). Fale apenas o texto devolvido.',
      validateInput: createZodToolValidator(recordOptOutArgumentsSchema),
      execute: async (_input, context) => {
        assertGrantContext(grant, context);
        return port.recordOptOut(scope);
      },
    },
  ];
}
