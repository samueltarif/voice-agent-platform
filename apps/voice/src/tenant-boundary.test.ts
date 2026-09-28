import { describe, expect, it } from 'vitest';
import { createCallSession } from './create-call-session.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';

describe('CallSession Tenant Boundary & Isolation', () => {
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const callId = '00000000-0000-0000-0000-000000000001';

  it('preserves organizationId invariant on CallSession creation', () => {
    const session = createCallSession({
      callId,
      organizationId: orgA,
      agentId: '33333333-3333-3333-3333-333333333333',
      agentVersionId: '44444444-4444-4444-4444-444444444444',
    });

    expect(session.organizationId).toBe(orgA);
    expect(session.callId).toBe(callId);
  });

  it('rejects invalid organizationId (non-UUID)', () => {
    expect(() =>
      createCallSession({
        callId,
        organizationId: 'invalid-org-id',
        agentId: '33333333-3333-3333-3333-333333333333',
        agentVersionId: '44444444-4444-4444-4444-444444444444',
      }),
    ).toThrow();
  });

  it('guarantees tenant-isolated lookup in InMemoryCallSessionStore', async () => {
    const store = new InMemoryCallSessionStore();
    const sessionA = createCallSession({
      callId,
      organizationId: orgA,
      agentId: '33333333-3333-3333-3333-333333333333',
      agentVersionId: '44444444-4444-4444-4444-444444444444',
    });
    await store.save(sessionA);

    // Organization A can retrieve its own session
    const retrievedOrgA = await store.getById(orgA, callId);
    expect(retrievedOrgA).not.toBeNull();
    expect(retrievedOrgA?.callId).toBe(callId);
    expect(retrievedOrgA?.organizationId).toBe(orgA);

    // Organization B CANNOT retrieve Organization A's session using the same callId
    const crossTenantLookup = await store.getById(orgB, callId);
    expect(crossTenantLookup).toBeNull();
  });

  it('allows same callId across different organizations without collision', async () => {
    const store = new InMemoryCallSessionStore();
    const sessionA = createCallSession({
      callId,
      organizationId: orgA,
      agentId: '33333333-3333-3333-3333-333333333333',
      agentVersionId: '44444444-4444-4444-4444-444444444444',
    });
    const sessionB = createCallSession({
      callId,
      organizationId: orgB,
      agentId: '55555555-5555-5555-5555-555555555555',
      agentVersionId: '66666666-6666-6666-6666-666666666666',
    });

    await store.save(sessionA);
    await store.save(sessionB);

    expect(store.size).toBe(2);

    const retrievedA = await store.getById(orgA, callId);
    const retrievedB = await store.getById(orgB, callId);

    expect(retrievedA?.organizationId).toBe(orgA);
    expect(retrievedA?.agentId).toBe('33333333-3333-3333-3333-333333333333');

    expect(retrievedB?.organizationId).toBe(orgB);
    expect(retrievedB?.agentId).toBe('55555555-5555-5555-5555-555555555555');
  });
});
