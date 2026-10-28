import { describe, expect, it } from 'vitest';
import {
  attemptEventTypeForCallStatus,
  failClosedWebhookAuthenticator,
  normalizedProviderEventSchema,
  providerDeliveryKey,
} from './provider-webhook-contracts.js';

const status = {
  kind: 'CALL_STATUS',
  providerEventId: null,
  providerCallReference: 'ref-1',
  occurredAt: '2026-10-28T12:00:00.000Z',
  status: 'CLOSED',
} as const;

describe('008-OF4 provider webhook contracts', () => {
  it('fails closed until a verified authenticator is configured', async () => {
    const outcome = await failClosedWebhookAuthenticator.authenticate({
      provider: 'any',
      headers: {},
      rawBody: '{}',
      receivedAt: new Date(),
    });
    expect(outcome).toEqual({ kind: 'REJECTED', reason: 'NOT_CONFIGURED' });
  });

  it('rejects tenant or attempt identifiers injected into normalized events', () => {
    for (const field of ['organizationId', 'attemptId', 'tenantId']) {
      expect(normalizedProviderEventSchema.safeParse({ ...status, [field]: 'x' }).success).toBe(
        false,
      );
    }
    expect(normalizedProviderEventSchema.safeParse(status).success).toBe(true);
  });

  it('maps status signals to domain events monotonically guarded by the FSM', () => {
    expect(attemptEventTypeForCallStatus('ACCEPTED')).toBe('ORIGINATION_ACCEPTED');
    expect(attemptEventTypeForCallStatus('REJECTED')).toBe('ORIGINATION_REJECTED');
    expect(attemptEventTypeForCallStatus('CLOSED')).toBe('CALL_CLOSED_CONFIRMED');
  });

  it('prefers the official event id and otherwise composes a deterministic key', () => {
    expect(providerDeliveryKey('p', { ...status, providerEventId: 'e-1' })).toBe('p|id|e-1');
    expect(providerDeliveryKey('p', status)).toBe('p|ref|ref-1|CLOSED');
    expect(providerDeliveryKey('p', status)).not.toBe(
      providerDeliveryKey('p', { ...status, status: 'ACCEPTED' }),
    );
  });
});
