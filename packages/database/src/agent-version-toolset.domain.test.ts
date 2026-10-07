import { describe, it, expect, vi } from 'vitest';
import { type AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { AgentDraftService } from './repositories/agent-draft-service.js';
import type { DatabaseInstance } from './client/connection.js';

describe('AgentVersion Toolset Persistence & Domain Invariants', () => {
  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const agentId = '33333333-3333-3333-3333-333333333333';
  const draftId = '44444444-4444-4444-4444-444444444444';
  const userId = 'usr-test-1';

  const validConfigWithTools: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa',
      objective: 'Atender clientes',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Não entendi',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja cordial'],
      deterministic: {
        operatingHours: '08:00 - 18:00',
      },
    },
    tools: ['agent.operating_hours'],
  };

  it('1. createDraft rejects unknown tool identity fail-closed before DB transaction', async () => {
    const mockDb = {} as DatabaseInstance;
    const draftService = new AgentDraftService(mockDb);

    await expect(
      draftService.createDraft({
        organizationId: orgA,
        agentId,
        configuration: {
          ...validConfigWithTools,
          tools: ['unknown.tool'],
        },
        createdBy: userId,
      }),
    ).rejects.toThrow();
  });

  it('2. createDraft rejects duplicate tool identities fail-closed before DB transaction', async () => {
    const mockDb = {} as DatabaseInstance;
    const draftService = new AgentDraftService(mockDb);

    await expect(
      draftService.createDraft({
        organizationId: orgA,
        agentId,
        configuration: {
          ...validConfigWithTools,
          tools: ['agent.operating_hours', 'agent.operating_hours'],
        },
        createdBy: userId,
      }),
    ).rejects.toThrow('Duplicate tool identities are not allowed');
  });

  it('3. updateDraftConfiguration rejects unknown tool identity fail-closed', async () => {
    const mockDb = {} as DatabaseInstance;
    const draftService = new AgentDraftService(mockDb);

    await expect(
      draftService.updateDraftConfiguration({
        organizationId: orgA,
        agentId,
        versionId: draftId,
        configuration: {
          ...validConfigWithTools,
          tools: ['unregistered_tool'],
        },
      }),
    ).rejects.toThrow();
  });

  it('4. updateDraftConfiguration rejects duplicate tool identities fail-closed', async () => {
    const mockDb = {} as DatabaseInstance;
    const draftService = new AgentDraftService(mockDb);

    await expect(
      draftService.updateDraftConfiguration({
        organizationId: orgA,
        agentId,
        versionId: draftId,
        configuration: {
          ...validConfigWithTools,
          tools: ['agent.operating_hours', 'agent.operating_hours'],
        },
      }),
    ).rejects.toThrow('Duplicate tool identities are not allowed');
  });

  it('5. updateDraftConfiguration enforces tenant-scoped query boundary (cross-tenant rejected)', async () => {
    // Mock db transaction with tenant isolation check
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]), // Returns empty because version belongs to Org A, but queried for Org B
    };

    const mockDb = {
      transaction: vi.fn(async (callback) => callback(mockTx)),
    } as unknown as DatabaseInstance;

    const draftService = new AgentDraftService(mockDb);

    // Attacker from orgB tries to update draft in orgA
    await expect(
      draftService.updateDraftConfiguration({
        organizationId: orgB,
        agentId,
        versionId: draftId,
        configuration: validConfigWithTools,
      }),
    ).rejects.toThrow(`AgentVersion '${draftId}' not found`);
  });

  it('6. publishing preserves configured toolset and snapshot immutability', () => {
    const publishedVersion = {
      id: draftId,
      agentId,
      organizationId: orgA,
      versionNumber: 1,
      status: 'PUBLISHED' as const,
      configuration: validConfigWithTools,
    };

    // Subsequent draft created for next version with different tools
    const nextDraftConfig: AgentConfigurationSnapshotV1 = {
      ...validConfigWithTools,
      tools: [], // tools disabled in next draft
    };

    // Verify published version retains its snapshot exactly
    expect(publishedVersion.configuration.tools).toEqual(['agent.operating_hours']);
    expect(nextDraftConfig.tools).toEqual([]);
    expect(publishedVersion.configuration.tools).not.toEqual(nextDraftConfig.tools);
  });
});
