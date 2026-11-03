import type { OperationsOverview } from '@voice-agent/contracts';

/** Visão operacional de teste (somente para testes de renderização). */
export const OVERVIEW: OperationsOverview = {
  periodDays: 7,
  since: '2026-10-27T00:00:00.000Z',
  campaigns: {
    byStatus: { DRAFT: 1, ACTIVE: 0, PAUSED: 1, COMPLETED: 0, CANCELED: 2 },
    running: [
      {
        campaignId: 'c1',
        name: 'Reativação',
        status: 'PAUSED',
        progress: {
          total: 4,
          scheduled: 1,
          inProgress: 2,
          heldByPause: 1,
          completed: 0,
          failed: 0,
          canceled: 0,
        },
      },
    ],
  },
  attempts: {
    total: 4,
    sent: 2,
    requiresManualReview: 1,
    byOutcome: {
      NOT_SENT_PENDING: 1,
      HELD_BY_PAUSE: 1,
      IN_FLIGHT: 1,
      OUTCOME_UNKNOWN: 1,
      NO_CALL_CREATED: 0,
      CANCELED_BEFORE_SEND: 0,
      ENDED: 0,
    },
  },
  liveSessions: 0,
  costs: null,
  handoffs: { available: false, reason: 'NOT_PERSISTED' },
  dispositions: { available: false, reason: 'PROVIDER_INTEGRATION_PENDING' },
};
