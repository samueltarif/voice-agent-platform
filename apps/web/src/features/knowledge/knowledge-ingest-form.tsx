import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@voice-agent/ui';
import type { KnowledgeSourceType } from '@voice-agent/contracts';
import { createIngestFieldBindings } from './ingest-field-bindings';
import { focusFirstInvalidField } from './focus-first-invalid-field';
import { IngestContentFields, IngestIdentityFields } from './knowledge-ingest-fields';
import { IngestSuccessPanel } from './knowledge-ingest-success';
import {
  validateKnowledgeForm,
  type KnowledgeFieldErrors,
  type KnowledgeFormValues,
} from './validate-knowledge-form';
import { KnowledgeErrorState } from './knowledge-error-state';
import { kindFromFailure, type KnowledgeFailure } from './knowledge-failure';

const EMPTY: KnowledgeFormValues = {
  title: '',
  sourceType: '',
  locator: '',
  rawText: '',
  collection: '',
};

export type IngestSubmitResult =
  | { readonly ok: true; readonly isIdempotentDuplicate: boolean }
  | { readonly ok: false; readonly status: number; readonly code?: string | undefined };

interface Props {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (
    v: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
  ) => Promise<IngestSubmitResult>;
}

export function KnowledgeIngestForm({ isOpen, onOpenChange, onSubmit }: Props) {
  const [values, setValues] = React.useState<KnowledgeFormValues>({
    title: '',
    sourceType: '',
    locator: '',
    rawText: '',
    collection: '',
  });
  const [errors, setErrors] = React.useState<KnowledgeFieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [failure, setFailure] = React.useState<KnowledgeFailure | undefined>();
  const [success, setSuccess] = React.useState<null | { duplicate: boolean }>(null);
  const bindings = createIngestFieldBindings({ values, errors, submitting, setValues });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const found = validateKnowledgeForm(values);
    setErrors(found);
    if (focusFirstInvalidField(found)) return;
    setSubmitting(true);
    try {
      const r = await onSubmit({ ...values, sourceType: values.sourceType as KnowledgeSourceType });
      if (r.ok) setSuccess({ duplicate: r.isIdempotentDuplicate });
      else setFailure({ status: r.status, code: r.code });
    } catch {
      setFailure({ status: 0 });
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        data-testid="kb-ingest-sheet"
      >
        <SheetHeader>
          <SheetTitle>Adicionar conhecimento</SheetTitle>
          <SheetDescription>
            Cadastre um documento de texto. Upload de arquivos não está disponível nesta versão.
          </SheetDescription>
        </SheetHeader>
        {success ? (
          <IngestSuccessPanel
            duplicate={success.duplicate}
            onAddAnother={() => {
              setValues(EMPTY);
              setSuccess(null);
            }}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4 py-4"
            aria-busy={submitting}
          >
            {failure !== undefined && (
              <KnowledgeErrorState kind={kindFromFailure(failure)} compact />
            )}
            <IngestIdentityFields bindings={bindings} />
            <IngestContentFields bindings={bindings} onCancel={() => onOpenChange(false)} />
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
