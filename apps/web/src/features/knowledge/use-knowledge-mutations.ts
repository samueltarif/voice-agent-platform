import * as React from 'react';
import type { KnowledgeDocumentResponse, KnowledgeSourceType } from '@voice-agent/contracts';
import {
  ingestKnowledgeDocument,
  archiveKnowledgeDocument,
} from '../../lib/knowledge/knowledge-documents-client';
import type { KnowledgeFormValues } from './validate-knowledge-form';
import type { IngestSubmitResult } from './knowledge-ingest-form';
import type { KnowledgeListRequest } from './use-knowledge-list';

export interface KnowledgeMutations {
  readonly ingestOpen: boolean;
  readonly setIngestOpen: (open: boolean) => void;
  readonly target: KnowledgeDocumentResponse | null;
  readonly setTarget: (doc: KnowledgeDocumentResponse | null) => void;
  readonly openArchiveTarget: (doc: KnowledgeDocumentResponse) => void;
  readonly archiving: boolean;
  readonly archiveError: number | undefined;
  readonly toast: string | null;
  readonly handleIngest: (
    values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
  ) => Promise<IngestSubmitResult>;
  readonly handleArchive: () => Promise<void>;
}

async function executeIngest(
  values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
): Promise<{ ok: true; isDuplicate: boolean } | { ok: false; status: number }> {
  try {
    const res = await ingestKnowledgeDocument({
      title: values.title.trim(),
      sourceType: values.sourceType,
      locator: values.locator.trim(),
      rawText: values.rawText,
      collection: values.collection.trim() || undefined,
    });
    const isDuplicate = Boolean(
      (res as { isIdempotentDuplicate?: boolean })?.isIdempotentDuplicate,
    );
    return { ok: true, isDuplicate };
  } catch (error) {
    const s = (error as { status?: unknown })?.status;
    const statusCode = typeof s === 'number' ? s : 0;
    return { ok: false, status: statusCode };
  }
}

async function executeArchive(
  docId: string,
): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    await archiveKnowledgeDocument(docId);
    return { ok: true };
  } catch (e) {
    const s = (e as { status?: unknown })?.status;
    const statusCode = typeof s === 'number' ? s : 0;
    return { ok: false, status: statusCode };
  }
}

function useIngestHandler(
  setToast: (t: string) => void,
  reload: (request?: KnowledgeListRequest) => Promise<void>,
  currentQuery: () => KnowledgeListRequest,
) {
  return React.useCallback(
    async (
      values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
    ): Promise<IngestSubmitResult> => {
      const res = await executeIngest(values);
      if (!res.ok) return { ok: false, status: res.status };
      setToast(
        res.isDuplicate
          ? 'Documento já cadastrado (conteúdo idêntico).'
          : 'Documento cadastrado com sucesso.',
      );
      await reload(currentQuery());
      return { ok: true, isIdempotentDuplicate: res.isDuplicate };
    },
    [setToast, reload, currentQuery],
  );
}

interface ArchiveHandlerProps {
  readonly target: KnowledgeDocumentResponse | null;
  readonly archiving: boolean;
  readonly setTarget: (doc: KnowledgeDocumentResponse | null) => void;
  readonly setArchiving: (archiving: boolean) => void;
  readonly setArchiveError: (error: number | undefined) => void;
  readonly setToast: (toast: string) => void;
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}

function useArchiveHandler(props: ArchiveHandlerProps) {
  const {
    target,
    archiving,
    setTarget,
    setArchiving,
    setArchiveError,
    setToast,
    reload,
    currentQuery,
  } = props;
  return React.useCallback(async () => {
    if (!target || archiving) return;
    setArchiving(true);
    setArchiveError(undefined);
    const res = await executeArchive(target.id);
    if (res.ok) {
      setTarget(null);
      setToast('Documento arquivado com sucesso.');
      await reload(currentQuery());
    } else {
      setArchiveError(res.status);
    }
    setArchiving(false);
  }, [target, archiving, setTarget, setArchiving, setArchiveError, setToast, reload, currentQuery]);
}

export function useKnowledgeMutations(
  reload: (request?: KnowledgeListRequest) => Promise<void>,
  currentQuery: () => KnowledgeListRequest,
): KnowledgeMutations {
  const [ingestOpen, setIngestOpen] = React.useState(false);
  const [target, setTarget] = React.useState<KnowledgeDocumentResponse | null>(null);
  const [archiving, setArchiving] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<number | undefined>();
  const [toast, setToast] = React.useState<string | null>(null);

  const handleIngest = useIngestHandler(setToast, reload, currentQuery);
  const handleArchive = useArchiveHandler({
    target,
    archiving,
    setTarget,
    setArchiving,
    setArchiveError,
    setToast,
    reload,
    currentQuery,
  });

  const openArchiveTarget = React.useCallback((doc: KnowledgeDocumentResponse) => {
    setArchiveError(undefined);
    setTarget(doc);
  }, []);

  return {
    ingestOpen,
    setIngestOpen,
    target,
    setTarget,
    openArchiveTarget,
    archiving,
    archiveError,
    toast,
    handleIngest,
    handleArchive,
  };
}
