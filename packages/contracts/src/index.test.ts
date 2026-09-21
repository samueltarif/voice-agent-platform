import { describe, expect, it } from 'vitest';
import type { DomainEvent, TenantScoped } from './index.js';

describe('Contracts Package', () => {
  it('should enforce TenantScoped structure', () => {
    const tenantEntity: TenantScoped = {
      organizationId: 'org_123',
    };
    expect(tenantEntity.organizationId).toBe('org_123');
  });

  it('should enforce DomainEvent structure', () => {
    const event: DomainEvent<{ callId: string }> = {
      id: 'evt_1',
      name: 'call.started',
      version: '1.0',
      timestamp: '2026-09-21T18:00:00.000Z',
      organizationId: 'org_123',
      correlationId: 'corr_456',
      payload: { callId: 'call_789' },
    };
    expect(event.name).toBe('call.started');
    expect(event.payload.callId).toBe('call_789');
  });
});
