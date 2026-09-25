import { describe, it, expect, vi } from 'vitest';
import type { BootstrapApiClient } from '../api/bootstrap-api-client.js';
import { SwitchOrganizationService } from './switch-organization-service.js';

describe('SwitchOrganizationService', () => {
  const service = new SwitchOrganizationService();

  it('rejects unauthenticated user', async () => {
    const client = {
      getOrganizationBySlug: vi.fn(),
    } as unknown as BootstrapApiClient;

    const result = await service.switchOrganization({
      userId: null,
      slug: 'acme-corp',
      bootstrapClient: client,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Sessão de usuário não autenticada.');
    expect(client.getOrganizationBySlug).not.toHaveBeenCalled();
  });

  it('rejects invalid slug format', async () => {
    const client = {
      getOrganizationBySlug: vi.fn(),
    } as unknown as BootstrapApiClient;

    const invalidSlugs = ['ACME', 'acme_corp', '', 'acme!', 'acme--corp', 123, null];

    for (const invalidSlug of invalidSlugs) {
      const result = await service.switchOrganization({
        userId: 'user-123',
        slug: invalidSlug,
        bootstrapClient: client,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Identificador de organização inválido');
    }

    expect(client.getOrganizationBySlug).not.toHaveBeenCalled();
  });

  it('successfully authorizes and switches to valid organization', async () => {
    const client = {
      getOrganizationBySlug: vi.fn().mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'acme-corp',
        name: 'Acme Corp',
        role: 'ADMIN',
      }),
    } as unknown as BootstrapApiClient;

    const result = await service.switchOrganization({
      userId: 'user-123',
      slug: 'acme-corp',
      bootstrapClient: client,
    });

    expect(result.success).toBe(true);
    expect(result.organization).toEqual({
      slug: 'acme-corp',
      name: 'Acme Corp',
    });
    // Crucial security check: UUID and role are not exposed in the client response
    expect((result.organization as Record<string, unknown>).id).toBeUndefined();
    expect((result.organization as Record<string, unknown>).role).toBeUndefined();
    expect(client.getOrganizationBySlug).toHaveBeenCalledWith('user-123', 'acme-corp', undefined);
  });

  it('sanitizes errors when backend rejects inaccessible organization', async () => {
    const client = {
      getOrganizationBySlug: vi.fn().mockRejectedValue(new Error('HTTP 404: Not Found')),
    } as unknown as BootstrapApiClient;

    const result = await service.switchOrganization({
      userId: 'user-123',
      slug: 'inaccessible-org',
      bootstrapClient: client,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Organização não encontrada ou acesso não autorizado.');
  });
});
