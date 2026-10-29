'use client';

import * as React from 'react';
import type { ContactSuppressionReason } from '@voice-agent/contracts';
import { operationsRequest } from '../../lib/operations/operations-client';
import type { ContactSuppressionView } from '../../lib/operations/operations-types';
import { useOperation } from '../operations/use-operation';

export interface AddSuppressionForm {
  readonly phone: string;
  readonly reason: ContactSuppressionReason;
  readonly evidenceReference?: string | undefined;
}

interface AddSuppressionResult {
  readonly status: 'SUPPRESSED' | 'ALREADY_SUPPRESSED';
  readonly suppression: ContactSuppressionView;
}

function addedMessage(result: AddSuppressionResult): string {
  return result.status === 'ALREADY_SUPPRESSED'
    ? `${result.suppression.phoneE164} já estava suprimido; o registro original foi mantido.`
    : `${result.suppression.phoneE164} suprimido. Ele não será mais discado.`;
}

/** Supressões do tenant. Só existe inclusão: remover supressão não é oferecido. */
export function useContactSuppressions(
  orgSlug: string,
  initial: readonly ContactSuppressionView[],
) {
  const [suppressions, setSuppressions] = React.useState(initial);
  const { run, pending, feedback } = useOperation();

  const add = React.useCallback(
    async (form: AddSuppressionForm) => {
      const body = {
        phone: form.phone,
        reason: form.reason,
        ...(form.evidenceReference ? { evidenceReference: form.evidenceReference } : {}),
      };
      const result = await run(
        () =>
          operationsRequest<AddSuppressionResult>(orgSlug, '/api/contact-suppressions', {
            method: 'POST',
            body,
          }),
        addedMessage,
      );
      if (!result) return false;
      try {
        const res = await operationsRequest<{ suppressions: ContactSuppressionView[] }>(
          orgSlug,
          '/api/contact-suppressions?limit=100',
        );
        setSuppressions(res.suppressions);
      } catch {
        // A supressão foi gravada; a lista será atualizada na próxima leitura.
      }
      return true;
    },
    [run, orgSlug],
  );

  return { suppressions, pending, feedback, add };
}
