import * as React from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button, Input } from '@voice-agent/ui';
import { KNOWLEDGE_SOURCE_TYPES } from '@voice-agent/contracts';
import { SOURCE_TYPE_LABELS, KNOWLEDGE_LIMITS } from './knowledge-labels';
import type { IngestFieldBindings } from './ingest-field-bindings';
import { IngestField } from './knowledge-ingest-field';

export { IngestField } from './knowledge-ingest-field';
export type { IngestFieldProps } from './knowledge-ingest-field';

const NATIVE =
  'w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function IngestIdentityFields({ bindings }: { readonly bindings: IngestFieldBindings }) {
  const { values, errors, submitting, onFieldChange, fieldA11y } = bindings;
  return (
    <>
      <IngestField id="kb-title" label="Título" required error={errors.title}>
        <Input
          id="kb-title"
          className="h-10 text-sm"
          value={values.title}
          onChange={onFieldChange('title')}
          disabled={submitting}
          maxLength={KNOWLEDGE_LIMITS.title}
          {...fieldA11y('title')}
        />
      </IngestField>

      <div className="grid gap-4 sm:grid-cols-2">
        <IngestField id="kb-sourceType" label="Tipo de origem" required error={errors.sourceType}>
          <select
            id="kb-sourceType"
            className={`${NATIVE} h-10`}
            value={values.sourceType}
            onChange={onFieldChange('sourceType')}
            disabled={submitting}
            {...fieldA11y('sourceType')}
          >
            <option value="">Selecione…</option>
            {KNOWLEDGE_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </IngestField>
        <IngestField
          id="kb-collection"
          label="Coleção"
          error={errors.collection}
          hint="Agrupa documentos relacionados."
        >
          <Input
            id="kb-collection"
            className="h-10 text-sm"
            value={values.collection}
            onChange={onFieldChange('collection')}
            disabled={submitting}
            maxLength={KNOWLEDGE_LIMITS.collection}
            {...fieldA11y('collection')}
          />
        </IngestField>
      </div>

      <IngestField
        id="kb-locator"
        label="Identificador da origem"
        required
        error={errors.locator}
        hint="Como localizar a origem: nome do manual, URL de referência ou código interno."
      >
        <Input
          id="kb-locator"
          className="h-10 text-sm font-mono"
          value={values.locator}
          onChange={onFieldChange('locator')}
          disabled={submitting}
          maxLength={KNOWLEDGE_LIMITS.locator}
          {...fieldA11y('locator')}
        />
      </IngestField>
    </>
  );
}

export function IngestContentFields({
  bindings,
  onCancel,
}: {
  readonly bindings: IngestFieldBindings;
  readonly onCancel: () => void;
}) {
  const { values, errors, submitting, onFieldChange, fieldA11y } = bindings;
  return (
    <>
      <IngestField id="kb-rawText" label="Conteúdo" required error={errors.rawText}>
        <textarea
          id="kb-rawText"
          rows={10}
          className={`${NATIVE} py-2 min-h-[12rem] resize-y`}
          value={values.rawText}
          onChange={onFieldChange('rawText')}
          disabled={submitting}
          {...fieldA11y('rawText')}
        />
        <p
          className={`text-[11px] text-right ${values.rawText.length > KNOWLEDGE_LIMITS.rawText ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {values.rawText.length.toLocaleString('pt-BR')} /{' '}
          {KNOWLEDGE_LIMITS.rawText.toLocaleString('pt-BR')}
        </p>
      </IngestField>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] text-xs"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          size="sm"
          className="min-h-[44px] text-xs gap-2"
          disabled={submitting}
          data-testid="kb-submit-ingest"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Cadastrar documento
            </>
          )}
        </Button>
      </div>
    </>
  );
}
