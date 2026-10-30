'use client';

import * as React from 'react';
import { OperationsRequestError } from '../../lib/operations/operations-client';
import { GENERIC_OPERATION_MESSAGE } from '../../lib/operations/operation-messages';
import { IDLE_FEEDBACK, type OperationFeedbackState } from './operation-feedback';

export function feedbackFromError(error: unknown): OperationFeedbackState {
  return {
    kind: 'error',
    message: error instanceof OperationsRequestError ? error.message : GENERIC_OPERATION_MESSAGE,
  };
}

/**
 * Executa uma mutação por vez (botões ficam desabilitados enquanto pendente)
 * e traduz o resultado em feedback seguro para exibição.
 */
export function useOperation() {
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<OperationFeedbackState>(IDLE_FEEDBACK);
  const inFlight = React.useRef(false);

  const run = React.useCallback(
    async <T>(work: () => Promise<T>, success: (result: T) => string): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      setFeedback(IDLE_FEEDBACK);
      try {
        const result = await work();
        setFeedback({ kind: 'success', message: success(result) });
        return result;
      } catch (error) {
        setFeedback(feedbackFromError(error));
        return null;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [],
  );

  return { pending, feedback, setFeedback, run };
}
