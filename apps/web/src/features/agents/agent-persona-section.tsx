import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Input } from '@voice-agent/ui';
import type { AgentPersonaV1 } from '@voice-agent/contracts';
import { PersonaRoleAndCompany, PersonaObjectiveAndTone } from './agent-persona-identity.js';

interface AgentPersonaSectionProps {
  readonly persona: AgentPersonaV1;
  readonly onChange: (persona: AgentPersonaV1) => void;
  readonly disabled?: boolean | undefined;
}

function PersonaPhrasesFields({
  persona,
  disabled,
  onUpdate,
}: {
  readonly persona: AgentPersonaV1;
  readonly disabled?: boolean | undefined;
  readonly onUpdate: (field: keyof AgentPersonaV1, value: string) => void;
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-border/40">
      <div className="space-y-1">
        <label htmlFor="persona-greeting" className="text-xs font-medium text-foreground">
          Frase de Saudação <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-greeting"
          data-testid="input-persona-greeting"
          value={persona.greetingPhrase}
          disabled={disabled}
          onChange={(e) => onUpdate('greetingPhrase', e.target.value)}
          placeholder="Ex: Olá! Como posso te ajudar hoje?"
          className="h-9 text-xs"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="persona-closing" className="text-xs font-medium text-foreground">
          Frase de Encerramento <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-closing"
          data-testid="input-persona-closing"
          value={persona.closingPhrase}
          disabled={disabled}
          onChange={(e) => onUpdate('closingPhrase', e.target.value)}
          placeholder="Ex: Obrigado pelo contato. Tenha um excelente dia!"
          className="h-9 text-xs"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="persona-fallback" className="text-xs font-medium text-foreground">
          Frase de Fallback (Repetição) <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-fallback"
          data-testid="input-persona-fallback"
          value={persona.fallbackPhrase}
          disabled={disabled}
          onChange={(e) => onUpdate('fallbackPhrase', e.target.value)}
          placeholder="Ex: Desculpe, não consegui entender. Pode repetir por favor?"
          className="h-9 text-xs"
          required
        />
      </div>
    </div>
  );
}

export function AgentPersonaSection({ persona, onChange, disabled }: AgentPersonaSectionProps) {
  const updateField = (field: keyof AgentPersonaV1, value: string) => {
    onChange({ ...persona, [field]: value });
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Persona e Identidade Vocal
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define o papel, tom e frases essenciais utilizadas pelo agente nas conversas.
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <PersonaRoleAndCompany persona={persona} disabled={disabled} onUpdate={updateField} />
        <PersonaObjectiveAndTone persona={persona} disabled={disabled} onUpdate={updateField} />
        <PersonaPhrasesFields persona={persona} disabled={disabled} onUpdate={updateField} />
      </CardContent>
    </Card>
  );
}
