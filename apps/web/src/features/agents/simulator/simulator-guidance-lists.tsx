import * as React from 'react';
import type {
  ConversationGuidanceExample,
  ConversationGuidanceStage,
} from '@voice-agent/contracts';

/** Textos já normalizados e cortados pela regra; aqui só quebra visual segura. */
const TEXT_CLASS = 'whitespace-pre-wrap break-words text-xs text-foreground';

export function SimulatorStagesList({
  stages,
}: {
  readonly stages: readonly ConversationGuidanceStage[];
}) {
  return (
    <ol className="space-y-2" data-testid="simulator-stages-list">
      {stages.map((stage, index) => (
        <li key={`${index}-${stage.name}`} className="rounded-md border border-border/60 p-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{`Etapa ${index + 1}`}</p>
          <p className={`${TEXT_CLASS} font-medium`}>{stage.name}</p>
          <p className={TEXT_CLASS}>{stage.goal}</p>
        </li>
      ))}
    </ol>
  );
}

export function SimulatorExamplesList({
  examples,
}: {
  readonly examples: readonly ConversationGuidanceExample[];
}) {
  return (
    <ol className="space-y-2" data-testid="simulator-examples-list">
      {examples.map((example, index) => (
        <li key={index} className="rounded-md border border-border/60 p-2">
          <dl className="space-y-1">
            <dt className="text-[11px] font-semibold text-muted-foreground">Cliente (exemplo)</dt>
            <dd className={TEXT_CLASS}>{example.customerInput}</dd>
            <dt className="text-[11px] font-semibold text-muted-foreground">
              Resposta ideal cadastrada
            </dt>
            <dd className={TEXT_CLASS}>{example.idealAgentResponse}</dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}
