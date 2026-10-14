import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@voice-agent/ui';
import type { KnowledgeSourceType } from '@voice-agent/contracts';
import { createIngestFieldBindings } from './ingest-field-bindings';
import { IngestContentFields, IngestIdentityFields } from './knowledge-ingest-fields';
import { IngestSuccessPanel } from './knowledge-ingest-success';
import {
  validateKnowledgeForm,
  type KnowledgeFieldErrors,
  type KnowledgeFormValues,
} from './validate-knowledge-form';
import { KnowledgeErrorState, kindFromStatus } from './knowledge-error-state';

const EMPTY: KnowledgeFormValues = {
  title: '',
  sourceType: '',
  locator: '',
  rawText: '',
  collection: '',
};

export type IngestSubmitResult =
  | { readonly ok: true; readonly isIdempotentDuplicate: boolean }
  | { readonly ok: false; readonly status: number };

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
  const [failStatus, setFailStatus] = React.useState<number | undefined>();
  const [success, setSuccess] = React.useState<null | { duplicate: boolean }>(null);
  const bindings = createIngestFieldBindings({ values, errors, submitting, setValues });
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const found = validateKnowledgeForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const r = await onSubmit({ ...values, sourceType: values.sourceType as KnowledgeSourceType });
      if (r.ok) setSuccess({ duplicate: r.isIdempotentDuplicate });
      else setFailStatus(r.status);
    } catch {
      setFailStatus(0);
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
            {failStatus !== undefined && (
              <KnowledgeErrorState kind={kindFromStatus(failStatus)} compact />
            )}
            <IngestIdentityFields bindings={bindings} />
            <IngestContentFields bindings={bindings} onCancel={() => onOpenChange(false)} />
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
