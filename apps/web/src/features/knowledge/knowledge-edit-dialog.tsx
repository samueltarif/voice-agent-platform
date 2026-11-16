import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Input } from '@voice-agent/ui';
import type { KnowledgeDocumentResponse } from '@voice-agent/contracts';
import type { KnowledgeDocumentEdit } from '../../lib/knowledge/knowledge-document-management-client';
import { KnowledgeDialogShell } from './knowledge-dialog-shell';
import { IngestField } from './knowledge-ingest-field';
import { KNOWLEDGE_LIMITS } from './knowledge-labels';
import type { KnowledgeOperationFailure } from './knowledge-operation-failure';
import {
  buildKnowledgeEdit,
  initialKnowledgeEditValues,
  validateKnowledgeEdit,
  type KnowledgeEditErrors,
  type KnowledgeEditValues,
} from './validate-knowledge-edit';

interface EditDialogProps {
  readonly doc: KnowledgeDocumentResponse | null;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly onClose: () => void;
  readonly onSubmit: (edit: KnowledgeDocumentEdit) => void;
}

function a11y(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};
}

function ContentReplacement(props: {
  readonly values: KnowledgeEditValues;
  readonly errors: KnowledgeEditErrors;
  readonly disabled: boolean;
  readonly onChange: (patch: Partial<KnowledgeEditValues>) => void;
}) {
  const { values, errors, disabled, onChange } = props;
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <label className="flex items-start gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={values.replaceContent}
          disabled={disabled}
          onChange={(e) => onChange({ replaceContent: e.target.checked })}
        />
        <span>
          Substituir o conteúdo. O texto atual não é exibido: cole a versão completa e atualizada.
        </span>
      </label>
      {values.replaceContent && (
        <IngestField id="kb-edit-rawText" label="Novo conteúdo" required error={errors.rawText}>
          <textarea
            id="kb-edit-rawText"
            className="w-full min-h-[160px] rounded-md border border-input bg-background p-3 text-sm"
            value={values.rawText}
            disabled={disabled}
            maxLength={KNOWLEDGE_LIMITS.rawText}
            onChange={(e) => onChange({ rawText: e.target.value })}
            {...a11y('kb-edit-rawText', errors.rawText)}
          />
        </IngestField>
      )}
    </div>
  );
}

function EditFields(props: {
  readonly values: KnowledgeEditValues;
  readonly errors: KnowledgeEditErrors;
  readonly disabled: boolean;
  readonly onChange: (patch: Partial<KnowledgeEditValues>) => void;
}) {
  const { values, errors, disabled, onChange } = props;
  const field =
    (key: 'title' | 'collection' | 'sourceVersion') => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: e.target.value });
  return (
    <div className="space-y-4">
      <IngestField id="kb-edit-title" label="Título" required error={errors.title}>
        <Input
          id="kb-edit-title"
          className="h-10 text-sm"
          value={values.title}
          disabled={disabled}
          maxLength={KNOWLEDGE_LIMITS.title}
          onChange={field('title')}
          {...a11y('kb-edit-title', errors.title)}
        />
      </IngestField>
      <div className="grid gap-4 sm:grid-cols-2">
        <IngestField id="kb-edit-collection" label="Coleção" error={errors.collection}>
          <Input
            id="kb-edit-collection"
            className="h-10 text-sm"
            value={values.collection}
            disabled={disabled}
            onChange={field('collection')}
            {...a11y('kb-edit-collection', errors.collection)}
          />
        </IngestField>
        <IngestField id="kb-edit-version" label="Versão da fonte" error={errors.sourceVersion}>
          <Input
            id="kb-edit-version"
            className="h-10 text-sm"
            value={values.sourceVersion}
            disabled={disabled}
            onChange={field('sourceVersion')}
            {...a11y('kb-edit-version', errors.sourceVersion)}
          />
        </IngestField>
      </div>
      <ContentReplacement values={values} errors={errors} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/** Edição de título, coleção, versão da fonte e substituição de conteúdo (DEC-054). */
export function KnowledgeEditDialog({ doc, pending, failure, onClose, onSubmit }: EditDialogProps) {
  // Estado inicial a partir do documento; o pai remonta o diálogo (key) a cada documento.
  const [values, setValues] = React.useState<KnowledgeEditValues | null>(() =>
    doc ? initialKnowledgeEditValues(doc) : null,
  );
  const [errors, setErrors] = React.useState<KnowledgeEditErrors>({});
  const change = (patch: Partial<KnowledgeEditValues>) =>
    setValues((v) => (v ? { ...v, ...patch } : v));
  const edit = doc && values ? buildKnowledgeEdit(doc, values) : {};
  const submit = () => {
    if (!values) return;
    const found = validateKnowledgeEdit(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(edit);
  };
  return (
    <KnowledgeDialogShell
      open={doc !== null && values !== null}
      testId="kb-edit-dialog"
      title="Editar documento"
      icon={<Pencil className="h-5 w-5 text-primary" aria-hidden="true" />}
      description="As alterações valem imediatamente para a busca da Base de Conhecimento."
      pending={pending}
      failure={failure}
      confirmLabel="Salvar alterações"
      pendingLabel="Salvando..."
      confirmDisabled={Object.keys(edit).length === 0}
      onClose={onClose}
      onConfirm={submit}
    >
      {values && (
        <EditFields values={values} errors={errors} disabled={pending} onChange={change} />
      )}
    </KnowledgeDialogShell>
  );
}
