import * as React from 'react';
import { Input } from '@voice-agent/ui';
import type { AgentPersonaV1 } from '@voice-agent/contracts';

const TONES: readonly { label: string; value: AgentPersonaV1['tone'] }[] = [
  { label: 'Formal', value: 'FORMAL' },
  { label: 'Casual', value: 'CASUAL' },
  { label: 'Empático', value: 'EMPATHETIC' },
  { label: 'Objetivo', value: 'OBJECTIVE' },
];

export function PersonaRoleAndCompany({
  persona,
  disabled,
  onUpdate,
}: {
  readonly persona: AgentPersonaV1;
  readonly disabled?: boolean | undefined;
  readonly onUpdate: (field: keyof AgentPersonaV1, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1">
        <label htmlFor="persona-role" className="text-xs font-medium text-foreground">
          Papel / Cargo <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-role"
          data-testid="input-persona-role"
          value={persona.role}
          disabled={disabled}
          onChange={(e) => onUpdate('role', e.target.value)}
          placeholder="Ex: Assistente de Vendas"
          className="h-9 text-xs"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="persona-company" className="text-xs font-medium text-foreground">
          Nome da Empresa <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-company"
          data-testid="input-persona-company"
          value={persona.companyName}
          disabled={disabled}
          onChange={(e) => onUpdate('companyName', e.target.value)}
          placeholder="Ex: Acampamentos Brasil"
          className="h-9 text-xs"
          required
        />
      </div>
    </div>
  );
}

export function PersonaObjectiveAndTone({
  persona,
  disabled,
  onUpdate,
}: {
  readonly persona: AgentPersonaV1;
  readonly disabled?: boolean | undefined;
  readonly onUpdate: (field: keyof AgentPersonaV1, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="sm:col-span-2 space-y-1">
        <label htmlFor="persona-objective" className="text-xs font-medium text-foreground">
          Objetivo Principal <span className="text-destructive">*</span>
        </label>
        <Input
          id="persona-objective"
          data-testid="input-persona-objective"
          value={persona.objective}
          disabled={disabled}
          onChange={(e) => onUpdate('objective', e.target.value)}
          placeholder="Ex: Qualificar leads e responder dúvidas comerciais"
          className="h-9 text-xs"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="persona-tone" className="text-xs font-medium text-foreground">
          Tom de Voz <span className="text-destructive">*</span>
        </label>
        <select
          id="persona-tone"
          data-testid="select-persona-tone"
          value={persona.tone}
          disabled={disabled}
          onChange={(e) => onUpdate('tone', e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {TONES.map((t) => (
            <option key={t.value} value={t.value} className="bg-popover text-popover-foreground">
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
