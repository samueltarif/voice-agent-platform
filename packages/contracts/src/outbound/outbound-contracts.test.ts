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
import {
  OUTBOUND_BATCH_MAX_SIZE,
  scheduleBatchJobsHttpBodySchema,
} from './outbound-batch-contracts.js';
import {
  createOutboundCampaignHttpBodySchema,
  listOutboundCampaignsQuerySchema,
} from './outbound-campaign-dtos.js';

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

  it('validates HTTP campaign creation schema without trusting client organizationId', () => {
    const valid = createOutboundCampaignHttpBodySchema.safeParse({
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      name: 'Black Friday Campaign',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.status).toBe('ACTIVE');
    }

    // Rejects body attempting to spoof organizationId (strict schema)
    const spoofAttempt = createOutboundCampaignHttpBodySchema.safeParse({
      organizationId: '99999999-9999-4999-8999-999999999999',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentVersionId: '33333333-3333-4333-8333-333333333333',
      name: 'Spoofed Org Campaign',
    });
    expect(spoofAttempt.success).toBe(false);
  });

  it('validates and bounds list campaigns query schema', () => {
    const parsedDefault = listOutboundCampaignsQuerySchema.safeParse({});
    expect(parsedDefault.success).toBe(true);
    if (parsedDefault.success) {
      expect(parsedDefault.data.limit).toBe(20);
      expect(parsedDefault.data.offset).toBe(0);
    }

    const parsedCustom = listOutboundCampaignsQuerySchema.safeParse({ limit: '50', offset: '10' });
    expect(parsedCustom.success).toBe(true);
    if (parsedCustom.success) {
      expect(parsedCustom.data.limit).toBe(50);
      expect(parsedCustom.data.offset).toBe(10);
    }

    const overLimit = listOutboundCampaignsQuerySchema.safeParse({ limit: 101 });
    expect(overLimit.success).toBe(false);
  });

  it('validates batch scheduling schema and enforces bounded batch size', () => {
    expect(OUTBOUND_BATCH_MAX_SIZE).toBe(100);

    const empty = scheduleBatchJobsHttpBodySchema.safeParse({ items: [] });
    expect(empty.success).toBe(false);

    const validBatch = scheduleBatchJobsHttpBodySchema.safeParse({
      batchIdempotencyKey: 'batch-test-1',
      items: [
        { destinationPhone: '+5511999990001', recipientName: 'Lead 1' },
        { destinationPhone: '+5511999990002', recipientName: 'Lead 2' },
      ],
    });
    expect(validBatch.success).toBe(true);

    const overSized = scheduleBatchJobsHttpBodySchema.safeParse({
      items: Array.from({ length: 101 }, (_, i) => ({
        destinationPhone: `+551199999${String(i).padStart(4, '0')}`,
      })),
    });
    expect(overSized.success).toBe(false);
  });
});
