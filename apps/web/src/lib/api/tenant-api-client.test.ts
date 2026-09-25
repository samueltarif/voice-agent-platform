import { describe, it, expect, vi } from 'vitest';
import type { InternalApiClient } from './internal-api-client.js';
import { TenantApiClient } from './tenant-api-client.js';
import type { ActiveOrganizationContext } from '../organization/active-organization-context.js';

const mockContext: ActiveOrganizationContext = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  slug: 'test-org',
  name: 'Test Org',
  role: 'ADMIN',
};

describe('TenantApiClient', () => {
  it('throws error when constructed without userId', () => {
    const mockInternalClient = {} as InternalApiClient;
    expect(() => new TenantApiClient(mockInternalClient, mockContext, '')).toThrow(
      'TenantApiClient requires an authenticated userId',
    );
  });

  it('throws error when constructed without valid organizationId in context', () => {
    const mockInternalClient = {} as InternalApiClient;
    const invalidContext = { ...mockContext, organizationId: '' };
    expect(() => new TenantApiClient(mockInternalClient, invalidContext, 'user-1')).toThrow(
      'TenantApiClient requires a valid ActiveOrganizationContext',
    );
  });

  it('forwards requests with server-validated organizationId and userId', async () => {
    const mockInternalClient = {
      request: vi.fn().mockResolvedValue({ data: 'ok' }),
    } as unknown as InternalApiClient;

    const client = new TenantApiClient(mockInternalClient, mockContext, 'user-123');

    const result = await client.request<{ data: string }>({
      method: 'GET',
      path: '/v1/agents',
      requestId: 'req-456',
    });

    expect(result).toEqual({ data: 'ok' });
    expect(mockInternalClient.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/agents',
      userId: 'user-123',
      organizationId: '00000000-0000-0000-0000-000000000001',
      requestId: 'req-456',
    });
  });

  it('forwards body on POST/PATCH requests', async () => {
    const mockInternalClient = {
      request: vi.fn().mockResolvedValue({ id: 'agent-1' }),
    } as unknown as InternalApiClient;

    const client = new TenantApiClient(mockInternalClient, mockContext, 'user-123');

    await client.request({
      method: 'POST',
      path: '/v1/agents',
      body: { name: 'Support Agent' },
    });

    expect(mockInternalClient.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/agents',
      userId: 'user-123',
      organizationId: '00000000-0000-0000-0000-000000000001',
      body: { name: 'Support Agent' },
    });
  });
});
