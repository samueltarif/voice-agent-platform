import * as React from 'react';
import { Input } from '@voice-agent/ui';

export interface AgentFormFieldsProps {
  readonly name: string;
  readonly slug: string;
  readonly submitting: boolean;
  readonly fieldErrors: { readonly name?: string; readonly slug?: string };
  readonly onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AgentFormFields({
  name,
  slug,
  submitting,
  fieldErrors,
  onNameChange,
  onSlugChange,
}: AgentFormFieldsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="agent-name" className="text-xs font-semibold text-foreground">
          Nome do agente <span className="text-destructive">*</span>
        </label>
        <Input
          id="agent-name"
          data-testid="input-agent-name"
          placeholder="Ex: Assistente de Vendas"
          value={name}
          onChange={onNameChange}
          disabled={submitting}
          className="h-10 text-sm"
          required
        />
        {fieldErrors.name && <p className="text-[11px] text-destructive">{fieldErrors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="agent-slug" className="text-xs font-semibold text-foreground">
          Slug identificador <span className="text-destructive">*</span>
        </label>
        <Input
          id="agent-slug"
          data-testid="input-agent-slug"
          placeholder="Ex: assistente-vendas"
          value={slug}
          onChange={onSlugChange}
          disabled={submitting}
          className="h-10 text-sm font-mono"
          required
        />
        <p className="text-[11px] text-muted-foreground">
          Identificador único na organização (letras minúsculas, números e hifens).
        </p>
        {fieldErrors.slug && <p className="text-[11px] text-destructive">{fieldErrors.slug}</p>}
      </div>
    </>
  );
}
