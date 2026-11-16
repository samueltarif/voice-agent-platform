import * as React from 'react';
import type { KnowledgeListRequest } from './use-knowledge-list';
import {
  describeKnowledgeFailure,
  type KnowledgeOperationFailure,
} from './knowledge-operation-failure';

export interface KnowledgeOperationRunner<T> {
  readonly target: T | null;
  readonly pending: boolean;
  readonly failure: KnowledgeOperationFailure | null;
  readonly toast: string | null;
  readonly open: (target: T) => void;
  readonly close: () => void;
  readonly run: (operation: () => Promise<unknown>, success: string) => Promise<void>;
}

/**
 * Executa UMA operação por vez: em sucesso fecha o diálogo, informa o resultado e
 * recarrega a lista; em falha mantém o diálogo aberto com a mensagem.
 */
export function useKnowledgeOperationRunner<T>(options: {
  readonly reload: (request?: KnowledgeListRequest) => Promise<void>;
  readonly currentQuery: () => KnowledgeListRequest;
}): KnowledgeOperationRunner<T> {
  const { reload, currentQuery } = options;
  const [target, setTarget] = React.useState<T | null>(null);
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<KnowledgeOperationFailure | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (operation: () => Promise<unknown>, success: string) => {
      if (pending) return;
      setPending(true);
      setFailure(null);
      try {
        await operation();
        setTarget(null);
        setToast(success);
        await reload(currentQuery());
      } catch (error) {
        setFailure(describeKnowledgeFailure(error));
      } finally {
        setPending(false);
      }
    },
    [pending, reload, currentQuery],
  );
  const open = React.useCallback((next: T) => {
    setFailure(null);
    setTarget(next);
  }, []);
  const close = React.useCallback(() => {
    if (!pending) setTarget(null);
  }, [pending]);

  return { target, pending, failure, toast, open, close, run };
}
