import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@voice-agent/ui';
import type { AgentRulesV1 } from '@voice-agent/contracts';
import { DeterministicRulesFields } from './agent-deterministic-rules.js';

interface AgentRulesSectionProps {
  readonly rules: AgentRulesV1;
  readonly onChange: (rules: AgentRulesV1) => void;
  readonly disabled?: boolean | undefined;
}

function ConversationalRulesList({
  rules,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: {
  readonly rules: readonly string[];
  readonly disabled?: boolean | undefined;
  readonly onAdd: () => void;
  readonly onUpdate: (index: number, value: string) => void;
  readonly onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Regras Conversacionais</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          className="h-7 text-xs"
          data-testid="btn-add-rule"
        >
          + Adicionar regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          Nenhuma regra conversacional definida.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                {idx + 1}.
              </span>
              <Input
                value={rule}
                disabled={disabled}
                onChange={(e) => onUpdate(idx, e.target.value)}
                placeholder="Ex: Nunca prometer prazos não confirmados"
                className="h-8 text-xs flex-1"
                data-testid={`input-rule-${idx}`}
                aria-label={`Regra conversacional ${idx + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(idx)}
                disabled={disabled}
                className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                data-testid={`btn-remove-rule-${idx}`}
                aria-label={`Remover regra ${idx + 1}`}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentRulesSection({ rules, onChange, disabled }: AgentRulesSectionProps) {
  const updateConversationalRule = (index: number, value: string) => {
    const updated = [...rules.conversational];
    updated[index] = value;
    onChange({ ...rules, conversational: updated });
  };

  const addConversationalRule = () => {
    onChange({ ...rules, conversational: [...rules.conversational, ''] });
  };

  const removeConversationalRule = (index: number) => {
    const updated = rules.conversational.filter((_, i) => i !== index);
    onChange({ ...rules, conversational: updated });
  };

  const updateMaxDiscount = (value: string) => {
    const num = value === '' ? undefined : Number(value);
    onChange({
      ...rules,
      deterministic: {
        ...rules.deterministic,
        maxDiscountPercent: Number.isNaN(num) ? undefined : num,
      },
    });
  };

  const updateOperatingHours = (value: string) => {
    onChange({
      ...rules,
      deterministic: {
        ...rules.deterministic,
        operatingHours: value === '' ? undefined : value,
      },
    });
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Regras de Comportamento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Regras conversacionais e limites determinísticos invioláveis pelo agente.
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        <ConversationalRulesList
          rules={rules.conversational}
          disabled={disabled}
          onAdd={addConversationalRule}
          onUpdate={updateConversationalRule}
          onRemove={removeConversationalRule}
        />
        <DeterministicRulesFields
          deterministic={rules.deterministic}
          disabled={disabled}
          onUpdateMaxDiscount={updateMaxDiscount}
          onUpdateOperatingHours={updateOperatingHours}
        />
      </CardContent>
    </Card>
  );
}
