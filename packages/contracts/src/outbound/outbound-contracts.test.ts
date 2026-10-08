import { describe, it, expect } from 'vitest';
import {
  OUTBOUND_CALL_JOB_STATUSES,
  TERMINAL_OUTBOUND_JOB_STATUSES,
  isValidJobStatusTransition,
  validateJobStatusTransition,
} from './outbound-job-status.js';
import {
  createOutboundCampaignInputSchema,
  createOutboundJobInputSchema,
} from './outbound-contracts.js';

describe('Outbound Contracts & State Machine (007E)', () => {
  it('identifies terminal outbound job states', () => {
    expect(OUTBOUND_CALL_JOB_STATUSES).toContain('SCHEDULED');
    expect(TERMINAL_OUTBOUND_JOB_STATUSES.has('FAILED_TERMINAL')).toBe(true);
    expect(TERMINAL_OUTBOUND_JOB_STATUSES.has('COMPLETED')).toBe(true);
    expect(TERMINAL_OUTBOUND_JOB_STATUSES.has('CANCELED')).toBe(true);
    expect(TERMINAL_OUTBOUND_JOB_STATUSES.has('SCHEDULED')).toBe(false);
    expect(TERMINAL_OUTBOUND_JOB_STATUSES.has('CLAIMED')).toBe(false);
  });

  it('allows valid state machine transitions', () => {
    expect(isValidJobStatusTransition('SCHEDULED', 'CLAIMED')).toBe(true);
    expect(isValidJobStatusTransition('SCHEDULED', 'CANCELED')).toBe(true);
    expect(isValidJobStatusTransition('CLAIMED', 'DISPATCHED')).toBe(true);
    expect(isValidJobStatusTransition('CLAIMED', 'FAILED_RETRYABLE')).toBe(true);
    expect(isValidJobStatusTransition('CLAIMED', 'FAILED_TERMINAL')).toBe(true);
    expect(isValidJobStatusTransition('CLAIMED', 'CANCELED')).toBe(true);
    expect(isValidJobStatusTransition('FAILED_RETRYABLE', 'CLAIMED')).toBe(true);
    expect(isValidJobStatusTransition('FAILED_RETRYABLE', 'CANCELED')).toBe(true);
    expect(isValidJobStatusTransition('DISPATCHED', 'COMPLETED')).toBe(true);
    expect(isValidJobStatusTransition('DISPATCHED', 'FAILED_TERMINAL')).toBe(true);
  });

  it('rejects invalid state machine transitions', () => {
    expect(isValidJobStatusTransition('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(isValidJobStatusTransition('SCHEDULED', 'DISPATCHED')).toBe(false);
    expect(isValidJobStatusTransition('COMPLETED', 'CLAIMED')).toBe(false);
    expect(isValidJobStatusTransition('FAILED_TERMINAL', 'SCHEDULED')).toBe(false);
    expect(isValidJobStatusTransition('CANCELED', 'CLAIMED')).toBe(false);

    expect(() => validateJobStatusTransition('SCHEDULED', 'COMPLETED')).toThrow(
      /Invalid outbound job status transition/,
    );
  });

  it('validates campaign creation input schema', () => {
    const valid = createOutboundCampaignInputSchema.safeParse({
      organizationId: '11111111-1111-4111-8111-111111111111',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      name: 'Q4 Customer Survey',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.status).toBe('DRAFT');
    }

    const invalid = createOutboundCampaignInputSchema.safeParse({
      organizationId: 'not-a-uuid',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      name: '',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates job creation input schema with defaults', () => {
    const valid = createOutboundJobInputSchema.safeParse({
      organizationId: '11111111-1111-4111-8111-111111111111',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      destinationPhone: '+5511999998888',
      idempotencyKey: 'job-lead-1234',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.maxAttempts).toBe(3);
      expect(valid.data.scheduledAt).toBeInstanceOf(Date);
    }
  });

  it('rejects invalid job creation input', () => {
    const invalid = createOutboundJobInputSchema.safeParse({
      organizationId: '11111111-1111-4111-8111-111111111111',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      destinationPhone: '',
      idempotencyKey: '',
    });
    expect(invalid.success).toBe(false);
  });
});
