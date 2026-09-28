import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@voice-agent/ui';
import type { AgentExampleV1 } from '@voice-agent/contracts';

interface AgentExamplesSectionProps {
  readonly examples?: readonly AgentExampleV1[] | undefined;
  readonly onChange: (examples: AgentExampleV1[]) => void;
  readonly disabled?: boolean | undefined;
}

interface AgentExampleItemProps {
  readonly example: AgentExampleV1;
  readonly index: number;
  readonly disabled?: boolean | undefined;
  readonly onUpdate: (index: number, field: keyof AgentExampleV1, value: string) => void;
  readonly onRemove: (index: number) => void;
}

function AgentExampleItem({ example, index, disabled, onUpdate, onRemove }: AgentExampleItemProps) {
  return (
    <div className="p-3 rounded-md border border-border/60 bg-muted/20 space-y-2 relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{`Exemplo ${index + 1}`}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
          data-testid={`btn-remove-example-${index}`}
          aria-label={`Remover exemplo ${index + 1}`}
        >
          Remover
        </Button>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <label htmlFor={`example-input-${index}`} className="text-xs font-medium text-foreground">
            Fala do Cliente
          </label>
          <Input
            id={`example-input-${index}`}
            data-testid={`input-example-customer-${index}`}
            value={example.customerInput}
            disabled={disabled}
            onChange={(e) => onUpdate(index, 'customerInput', e.target.value)}
            placeholder="Ex: Vocês dão desconto à vista?"
            className="h-8 text-xs"
            required
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`example-response-${index}`}
            className="text-xs font-medium text-foreground"
          >
            Resposta Ideal do Agente
          </label>
          <Input
            id={`example-response-${index}`}
            data-testid={`input-example-response-${index}`}
            value={example.idealAgentResponse}
            disabled={disabled}
            onChange={(e) => onUpdate(index, 'idealAgentResponse', e.target.value)}
            placeholder="Ex: Sim! Temos até 10% de desconto para pagamentos no PIX."
            className="h-8 text-xs"
            required
          />
        </div>
      </div>
    </div>
  );
}

export function AgentExamplesSection({ examples, onChange, disabled }: AgentExamplesSectionProps) {
  const list = examples ?? [];

  const updateExample = (index: number, field: keyof AgentExampleV1, value: string) => {
    const updated = list.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    onChange(updated);
  };

  const addExample = () => {
    onChange([...list, { customerInput: '', idealAgentResponse: '' }]);
  };

  const removeExample = (index: number) => {
    const updated = list.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Exemplos Few-Shot de Conversação
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Pares de fala do cliente e resposta ideal esperada do agente.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addExample}
          disabled={disabled}
          className="h-7 text-xs"
          data-testid="btn-add-example"
        >
          + Adicionar exemplo
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Nenhum exemplo conversacional cadastrado.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((ex, idx) => (
              <AgentExampleItem
                key={idx}
                example={ex}
                index={idx}
                disabled={disabled}
                onUpdate={updateExample}
                onRemove={removeExample}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
