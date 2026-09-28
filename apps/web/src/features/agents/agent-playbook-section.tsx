import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@voice-agent/ui';
import type { AgentPlaybookV1, AgentPlaybookV1 as PlaybookType } from '@voice-agent/contracts';

type PlaybookStage = PlaybookType['stages'][number];

interface AgentPlaybookSectionProps {
  readonly playbook?: AgentPlaybookV1 | undefined;
  readonly onChange: (playbook: AgentPlaybookV1) => void;
  readonly disabled?: boolean | undefined;
}

interface AgentPlaybookStageItemProps {
  readonly stage: PlaybookStage;
  readonly index: number;
  readonly disabled?: boolean | undefined;
  readonly onUpdate: (index: number, field: 'name' | 'goal', value: string) => void;
  readonly onRemove: (index: number) => void;
}

function AgentPlaybookStageItem({
  stage,
  index,
  disabled,
  onUpdate,
  onRemove,
}: AgentPlaybookStageItemProps) {
  return (
    <div className="p-3 rounded-md border border-border/60 bg-muted/20 space-y-2 relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{`Etapa ${index + 1}`}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
          data-testid={`btn-remove-stage-${index}`}
          aria-label={`Remover etapa ${index + 1}`}
        >
          Remover
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <label htmlFor={`stage-name-${index}`} className="text-xs font-medium text-foreground">
            Nome da Etapa
          </label>
          <Input
            id={`stage-name-${index}`}
            data-testid={`input-stage-name-${index}`}
            value={stage.name}
            disabled={disabled}
            onChange={(e) => onUpdate(index, 'name', e.target.value)}
            placeholder="Ex: Abertura"
            className="h-8 text-xs"
            required
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label htmlFor={`stage-goal-${index}`} className="text-xs font-medium text-foreground">
            Objetivo
          </label>
          <Input
            id={`stage-goal-${index}`}
            data-testid={`input-stage-goal-${index}`}
            value={stage.goal}
            disabled={disabled}
            onChange={(e) => onUpdate(index, 'goal', e.target.value)}
            placeholder="Ex: Identificar a necessidade e qualificar o lead"
            className="h-8 text-xs"
            required
          />
        </div>
      </div>
    </div>
  );
}

export function AgentPlaybookSection({ playbook, onChange, disabled }: AgentPlaybookSectionProps) {
  const stages = playbook?.stages ?? [];

  const updateStage = (index: number, field: 'name' | 'goal', value: string) => {
    const updated = stages.map((stage, i) => (i === index ? { ...stage, [field]: value } : stage));
    onChange({ stages: updated });
  };

  const addStage = () => {
    onChange({
      stages: [...stages, { name: '', goal: '' }],
    });
  };

  const removeStage = (index: number) => {
    const updated = stages.filter((_, i) => i !== index);
    onChange({ stages: updated });
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">Playbook e Etapas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Etapas estruturadas do fluxo conversacional e seus objetivos.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addStage}
          disabled={disabled}
          className="h-7 text-xs"
          data-testid="btn-add-stage"
        >
          + Adicionar etapa
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {stages.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Nenhuma etapa de playbook definida.
          </p>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, idx) => (
              <AgentPlaybookStageItem
                key={idx}
                stage={stage}
                index={idx}
                disabled={disabled}
                onUpdate={updateStage}
                onRemove={removeStage}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
