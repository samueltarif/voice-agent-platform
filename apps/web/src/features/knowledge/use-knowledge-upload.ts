import * as React from 'react';
import type { KnowledgeExtractionResponse, KnowledgeSourceType } from '@voice-agent/contracts';
import {
  extractKnowledgeFile,
  precheckKnowledgeFile,
} from '../../lib/knowledge/knowledge-extraction-client';
import type { KnowledgeFormValues } from './validate-knowledge-form';
import type { IngestSubmitResult } from './knowledge-ingest-form';
import { describeKnowledgeFailure } from './knowledge-operation-failure';

export type UploadPhase = 'select' | 'reading' | 'preview' | 'confirming' | 'done';

export const UPLOAD_CONFLICT_MESSAGE =
  'Já existe um documento com este nome de arquivo e conteúdo diferente. Para atualizá-lo, abra o documento na lista e use “Editar conteúdo”.';

export type UploadConfirm = (
  values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
) => Promise<IngestSubmitResult>;

export interface KnowledgeUploadState {
  readonly phase: UploadPhase;
  readonly file: File | null;
  readonly preview: KnowledgeExtractionResponse | null;
  readonly title: string;
  readonly sourceType: KnowledgeSourceType;
  readonly error: string | null;
  readonly duplicate: boolean;
  selectFile(file: File | null): void;
  setTitle(title: string): void;
  setSourceType(type: KnowledgeSourceType): void;
  read(): Promise<void>;
  confirm(): Promise<void>;
  reset(): void;
}

/** Conflito (mesmo nome, outro conteúdo) orienta para “Editar conteúdo” (D-A4). */
export function describeUploadConfirmFailure(
  result: Extract<IngestSubmitResult, { ok: false }>,
): string {
  if (result.status === 409) return UPLOAD_CONFLICT_MESSAGE;
  return describeKnowledgeFailure({ status: result.status, code: result.code }).message;
}

interface UploadCore {
  readonly phase: UploadPhase;
  readonly setPhase: (phase: UploadPhase) => void;
  readonly setError: (error: string | null) => void;
}

function useUploadReader(orgSlug: string, core: UploadCore) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<KnowledgeExtractionResponse | null>(null);
  const [title, setTitle] = React.useState('');
  const { phase, setPhase, setError } = core;
  const selectFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setPhase('select');
    setError(next ? (precheckKnowledgeFile(next)?.message ?? null) : null);
  };
  const read = async () => {
    if (!file || phase === 'reading') return;
    setPhase('reading');
    setError(null);
    try {
      const result = await extractKnowledgeFile(orgSlug, file);
      setPreview(result);
      setTitle(result.suggestedTitle);
      setPhase('preview');
    } catch (failure) {
      setError(describeKnowledgeFailure(failure).message);
      setPhase('select');
    }
  };
  return { file, preview, title, setTitle, selectFile, read };
}

interface ConfirmInput {
  readonly preview: KnowledgeExtractionResponse | null;
  readonly title: string;
  readonly sourceType: KnowledgeSourceType;
}

function useUploadConfirmer(core: UploadCore, onConfirm: UploadConfirm) {
  const [duplicate, setDuplicate] = React.useState(false);
  const { phase, setPhase, setError } = core;
  const confirm = async ({ preview, title, sourceType }: ConfirmInput) => {
    if (!preview || phase !== 'preview' || !title.trim()) return;
    setPhase('confirming');
    setError(null);
    const values = {
      title,
      sourceType,
      locator: preview.suggestedLocator,
      rawText: preview.text,
      collection: '',
    };
    const result = await onConfirm(values).catch(() => ({ ok: false as const, status: 0 }));
    if (result.ok) {
      setDuplicate(result.isIdempotentDuplicate);
      setPhase('done');
      return;
    }
    setError(describeUploadConfirmFailure(result));
    setPhase('preview');
  };
  return { duplicate, setDuplicate, confirm };
}

/**
 * Envio de arquivo em duas etapas (DEC-065): ler (pré-visualização somente
 * leitura, nada é gravado) e confirmar (ingestão existente). Só a confirmação
 * explícita persiste o documento.
 */
export function useKnowledgeUpload(
  orgSlug: string,
  onConfirm: UploadConfirm,
): KnowledgeUploadState {
  const [phase, setPhase] = React.useState<UploadPhase>('select');
  const [error, setError] = React.useState<string | null>(null);
  const [sourceType, setSourceType] = React.useState<KnowledgeSourceType>('MANUAL_UPLOAD');
  const core = { phase, setPhase, setError };
  const reader = useUploadReader(orgSlug, core);
  const confirmer = useUploadConfirmer(core, onConfirm);
  const { preview, title } = reader;
  return {
    phase,
    error,
    sourceType,
    setSourceType,
    file: reader.file,
    preview,
    title,
    setTitle: reader.setTitle,
    selectFile: reader.selectFile,
    read: reader.read,
    duplicate: confirmer.duplicate,
    confirm: () => confirmer.confirm({ preview, title, sourceType }),
    reset: () => {
      reader.selectFile(null);
      reader.setTitle('');
      confirmer.setDuplicate(false);
    },
  };
}
