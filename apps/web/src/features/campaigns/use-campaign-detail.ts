'use client';

import * as React from 'react';
import type { CampaignAction, CampaignActionOutcome } from '@voice-agent/contracts';
import { operationsRequest } from '../../lib/operations/operations-client';
import type { CampaignDetailView } from '../../lib/operations/operations-types';
import { useOperation } from '../operations/use-operation';
import { campaignActionSuccess } from './campaign-action-messages';

type Transitioned = Extract<CampaignActionOutcome, { kind: 'TRANSITIONED' }>;

/** Estado da tela de campanha: toda mutação termina relendo o estado real da API. */
export function useCampaignDetail(orgSlug: string, initial: CampaignDetailView) {
  const [detail, setDetail] = React.useState(initial);
  const { run, pending, feedback } = useOperation();
  const base = `/api/campaigns/${initial.campaign.id}`;

  const reload = React.useCallback(async () => {
    try {
      setDetail(await operationsRequest<CampaignDetailView>(orgSlug, base));
    } catch {
      // Mantém o último estado conhecido; o feedback da mutação já informa o usuário.
    }
  }, [orgSlug, base]);

  const assignAudience = React.useCallback(
    async (contactListId: string) => {
      await run(
        () =>
          operationsRequest(orgSlug, `${base}/audience`, {
            method: 'PUT',
            body: { contactListId },
          }),
        () => 'Audiência salva.',
      );
      await reload();
    },
    [run, orgSlug, base, reload],
  );

  const applyAction = React.useCallback(
    async (action: CampaignAction) => {
      await run(
        () =>
          operationsRequest<Transitioned>(orgSlug, `${base}/actions`, {
            method: 'POST',
            body: { action },
          }),
        (outcome) => campaignActionSuccess(action, outcome),
      );
      await reload();
    },
    [run, orgSlug, base, reload],
  );

  return { detail, pending, feedback, assignAudience, applyAction };
}
