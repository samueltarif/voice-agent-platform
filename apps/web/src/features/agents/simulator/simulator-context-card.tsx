import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@voice-agent/ui';
import {
  composeConversationGuidance,
  CONVERSATION_GUIDANCE_LIMITS,
  type AgentConfigurationSnapshotV1,
} from '@voice-agent/contracts';
import { SimulatorExamplesList, SimulatorStagesList } from './simulator-guidance-lists.js';

/** Resumo calculado pela regra determinística (`composeConversationGuidance`). */
function describePlaybook(config: AgentConfigurationSnapshotV1, included: number, omitted: number) {
  if (!config.playbook) return 'Nenhum roteiro definido nesta configuração.';
  if (config.playbook.stages.length === 0) return 'Roteiro definido, mas sem etapas.';
  return `${included} de ${included + omitted} etapas entram no contexto (limite: ${CONVERSATION_GUIDANCE_LIMITS.maxStages}).`;
}

function describeExamples(included: number, omitted: number) {
  if (included + omitted === 0) return 'Nenhum exemplo cadastrado nesta configuração.';
  return `${included} de ${included + omitted} exemplos entram no contexto (limite: ${CONVERSATION_GUIDANCE_LIMITS.maxExamples}).`;
}

export function SimulatorContextCard({
  config,
}: {
  readonly config: AgentConfigurationSnapshotV1;
}) {
  const { guidance, stats } = composeConversationGuidance(config);
  const rules = config.rules.conversational?.length ?? 0;
  return (
    <Card
      role="region"
      aria-labelledby="simulator-context-title"
      data-testid="simulator-context-card"
    >
      <CardHeader className="space-y-1">
        <CardTitle id="simulator-context-title" className="text-base">
          Contexto e roteiro
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Regra determinística — não é resposta de IA. Ordem no contexto: regras de conversa, aviso
          de precedência, etapas e exemplos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <ul className="space-y-1 text-muted-foreground" data-testid="simulator-context-summary">
          <li>{`${rules} regra(s) de conversa prevalecem sobre etapas e exemplos.`}</li>
          <li data-testid="simulator-playbook-summary">
            {describePlaybook(config, stats.stagesIncluded, stats.stagesOmitted)}
          </li>
          <li data-testid="simulator-examples-summary">
            {describeExamples(stats.examplesIncluded, stats.examplesOmitted)}
          </li>
          {stats.fieldsTruncated > 0 && (
            <li data-testid="simulator-truncation-summary">
              {`${stats.fieldsTruncated} texto(s) cortado(s) no limite e marcado(s) com "…".`}
            </li>
          )}
        </ul>
        {guidance.playbook && (
          <section aria-label="Etapas que entram no contexto" className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Etapas do atendimento</h3>
            <SimulatorStagesList stages={guidance.playbook.stages} />
          </section>
        )}
        {guidance.examples && (
          <section aria-label="Exemplos que entram no contexto" className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Exemplos ilustrativos</h3>
            <SimulatorExamplesList examples={guidance.examples} />
          </section>
        )}
      </CardContent>
    </Card>
  );
}
