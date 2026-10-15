import * as React from 'react';
import type { KnowledgeDocumentResponse, KnowledgeSourceType } from '@voice-agent/contracts';
import {
  ingestKnowledgeDocument,
  archiveKnowledgeDocument,
} from '../../lib/knowledge/knowledge-documents-client';
import type { KnowledgeFormValues } from './validate-knowledge-form';
import type { IngestSubmitResult } from './knowledge-ingest-form';
import type { KnowledgeListRequest } from './use-knowledge-list';
import { failureOf, type KnowledgeFailure } from './knowledge-failure';

export interface KnowledgeMutations {
  readonly ingestOpen: boolean;
  readonly setIngestOpen: (open: boolean) => void;
  readonly target: KnowledgeDocumentResponse | null;
  readonly setTarget: (doc: KnowledgeDocumentResponse | null) => void;
  readonly openArchiveTarget: (doc: KnowledgeDocumentResponse) => void;
  readonly archiving: boolean;
  readonly archiveError: KnowledgeFailure | undefined;
  readonly toast: string | null;
  readonly handleIngest: (
    values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
  ) => Promise<IngestSubmitResult>;
  readonly handleArchive: () => Promise<void>;
}

async function executeIngest(
  orgSlug: string,
  values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
): Promise<{ ok: true; isDuplicate: boolean } | { ok: false; failure: KnowledgeFailure }> {
  try {
    const res = await ingestKnowledgeDocument(orgSlug, {
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
    return { ok: false, failure: failureOf(error) };
  }
}

async function executeArchive(
  orgSlug: string,
  docId: string,
): Promise<{ ok: true } | { ok: false; failure: KnowledgeFailure }> {
  try {
    await archiveKnowledgeDocument(orgSlug, docId);
    return { ok: true };
  } catch (e) {
    return { ok: false, failure: failureOf(e) };
  }
}

interface IngestHandlerProps {
  readonly orgSlug: string;
  readonly setToast: (t: string) => void;
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}

function useIngestHandler(props: IngestHandlerProps) {
  const { orgSlug, setToast, reload, currentQuery } = props;
  return React.useCallback(
    async (
      values: KnowledgeFormValues & { sourceType: KnowledgeSourceType },
    ): Promise<IngestSubmitResult> => {
      const res = await executeIngest(orgSlug, values);
      if (!res.ok) return { ok: false, status: res.failure.status, code: res.failure.code };
      setToast(
        res.isDuplicate
          ? 'Documento já cadastrado (conteúdo idêntico).'
          : 'Documento cadastrado com sucesso.',
      );
      await reload(currentQuery());
      return { ok: true, isIdempotentDuplicate: res.isDuplicate };
    },
    [orgSlug, setToast, reload, currentQuery],
  );
}

interface ArchiveHandlerProps {
  readonly orgSlug: string;
  readonly target: KnowledgeDocumentResponse | null;
  readonly archiving: boolean;
  readonly setTarget: (doc: KnowledgeDocumentResponse | null) => void;
  readonly setArchiving: (archiving: boolean) => void;
  readonly setArchiveError: (error: KnowledgeFailure | undefined) => void;
  readonly setToast: (toast: string) => void;
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}

function useArchiveHandler(props: ArchiveHandlerProps) {
  const {
    orgSlug,
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
    const res = await executeArchive(orgSlug, target.id);
    if (res.ok) {
      setTarget(null);
      setToast('Documento arquivado com sucesso.');
      await reload(currentQuery());
    } else {
      setArchiveError(res.failure);
    }
    setArchiving(false);
  }, [
    orgSlug,
    target,
    archiving,
    setTarget,
    setArchiving,
    setArchiveError,
    setToast,
    reload,
    currentQuery,
  ]);
}

export function useKnowledgeMutations(
  orgSlug: string,
  reload: (request?: KnowledgeListRequest) => Promise<void>,
  currentQuery: () => KnowledgeListRequest,
): KnowledgeMutations {
  const [ingestOpen, setIngestOpen] = React.useState(false);
  const [target, setTarget] = React.useState<KnowledgeDocumentResponse | null>(null);
  const [archiving, setArchiving] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<KnowledgeFailure | undefined>();
  const [toast, setToast] = React.useState<string | null>(null);

  const handleIngest = useIngestHandler({ orgSlug, setToast, reload, currentQuery });
  const handleArchive = useArchiveHandler({
    orgSlug,
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
