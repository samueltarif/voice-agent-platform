import { describe, expect, it } from 'vitest';
import { OUTBOUND_ATTEMPT_STATES } from '../telephony/outbound-attempt-state.js';
import {
  ATTEMPT_OUTCOME_CLASSES,
  attemptStatesForOutcome,
  classifyAttemptOutcome,
  listCampaignAttemptsQuerySchema,
  maskPhoneE164,
} from './campaign-report.js';
import { OUTBOUND_CAMPAIGN_STATUSES } from './outbound-contracts.js';

describe('008-MVP4 attempt outcome classes', () => {
  it('classifies every persisted state without ever claiming success or failure', () => {
    expect(
      Object.fromEntries(
        OUTBOUND_ATTEMPT_STATES.map((s) => [s, classifyAttemptOutcome(s, 'ACTIVE')]),
      ),
    ).toEqual({
      CREATED: 'NOT_SENT_PENDING',
      ORIGINATION_PENDING: 'NOT_SENT_PENDING',
      ORIGINATION_SENT: 'IN_FLIGHT',
      ORIGINATION_ACCEPTED: 'IN_FLIGHT',
      OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
      RECONCILIATION_PENDING: 'OUTCOME_UNKNOWN',
      ORIGINATION_REJECTED: 'NO_CALL_CREATED',
      NOT_ORIGINATED: 'NO_CALL_CREATED',
      CLOSED: 'ENDED',
      CANCELED: 'CANCELED_BEFORE_SEND',
    });
  });

  it('marks unsent attempts as held only while the campaign is paused', () => {
    for (const status of OUTBOUND_CAMPAIGN_STATUSES) {
      const expected = status === 'PAUSED' ? 'HELD_BY_PAUSE' : 'NOT_SENT_PENDING';
      expect([status, classifyAttemptOutcome('ORIGINATION_PENDING', status)]).toEqual([
        status,
        expected,
      ]);
    }
    expect(classifyAttemptOutcome('ORIGINATION_SENT', 'PAUSED')).toBe('IN_FLIGHT');
    expect(classifyAttemptOutcome('OUTCOME_UNKNOWN', 'PAUSED')).toBe('OUTCOME_UNKNOWN');
  });

  it('maps every class back to the states that compose it (partition of the FSM)', () => {
    const covered = ATTEMPT_OUTCOME_CLASSES.filter((c) => c !== 'HELD_BY_PAUSE').flatMap(
      attemptStatesForOutcome,
    );
    expect([...covered].sort()).toEqual([...OUTBOUND_ATTEMPT_STATES].sort());
    expect(attemptStatesForOutcome('HELD_BY_PAUSE')).toEqual(
      attemptStatesForOutcome('NOT_SENT_PENDING'),
    );
  });
});

describe('maskPhoneE164', () => {
  it('keeps the last 4 digits (and the Brazilian area code) only', () => {
    expect(maskPhoneE164('+5511987650001')).toBe('+55 11 •••••-0001');
    expect(maskPhoneE164('+551133330002')).toBe('+55 11 ••••-0002');
    expect(maskPhoneE164('+14155550123')).toBe('+•••••••-0123');
  });

  it('never echoes values that are not E.164', () => {
    expect(maskPhoneE164('(11) 98765-0001')).toBe('•••');
    expect(maskPhoneE164('<script>')).toBe('•••');
  });
});

describe('listCampaignAttemptsQuerySchema', () => {
  it('bounds pagination and accepts only known outcome classes', () => {
    expect(listCampaignAttemptsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(listCampaignAttemptsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listCampaignAttemptsQuerySchema.safeParse({ outcome: 'SUCCESS' }).success).toBe(false);
    expect(listCampaignAttemptsQuerySchema.safeParse({ extra: '1' }).success).toBe(false);
  });
});
