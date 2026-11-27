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
 * E2 (DEC-075 D2/D5; DEC-077) — `lead.record_outcome` e `lead.record_opt_out`,
 * ligadas a uma concessão legítima. Lead, telefone e tenant vêm só do
 * contexto confiável. O opt-out suprime na hora (preventivo); o resultado é
 * só proposto e aplicado na reconciliação pós-chamada, com evidência no
 * histórico. Nada aqui entra em composição de produção.
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
        'Propõe o resultado comercial da conversa (CONTACTED, QUALIFIED ou NOT_INTERESTED). Não use para silêncio, ausência de resposta, inatividade ou falha técnica.',
      validateInput: createZodToolValidator(recordOutcomeArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.recordOutcome(scope, input);
      },
    },
    {
      name: LEAD_RECORD_OPT_OUT_TOOL,
      description:
        'Use assim que a pessoa pedir para não receber mais ligações: suprime o telefone na hora. Informe a frase dita (leadPhrase). Depois, não ofereça mais nada.',
      validateInput: createZodToolValidator(recordOptOutArgumentsSchema),
      execute: async (input, context) => {
        assertGrantContext(grant, context);
        return port.recordOptOut(scope, input);
      },
    },
  ];
}
