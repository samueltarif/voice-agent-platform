import { describe, it, expect } from 'vitest';
import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import { createPublishedVersionToolAuthorizer } from './published-version-toolset.js';
import { createCatalogSearchToolDefinition } from './catalog-search-tool.js';
import { createCatalogItemDetailToolDefinition } from './catalog-item-detail-tool.js';
import { createOperatingHoursToolDefinition } from './operating-hours-tool.js';
import type { CatalogQueryPort } from './catalog-query-port.js';

const ORG_A = '11111111-1111-1111-1111-111111111111';

function createSnapshot(
  tools: AgentConfigurationSnapshotV1['tools'],
): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa',
      objective: 'Atender',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Repita',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: '08:00-18:00' } },
    tools,
  };
}

function createFakePort(): CatalogQueryPort {
  return {
    searchCatalog: async (input) => {
      if (input.organizationId !== ORG_A) {
        return [];
      }
      return [
        {
          id: '22222222-2222-2222-2222-222222222222',
          kind: 'PRODUCT',
          name: 'Plano Mensal',
          description: null,
          sku: 'SKU-1',
          active: true,
          priceCents: 29900,
          currency: 'BRL',
        },
      ];
    },
    getCatalogItem: async () => null,
  };
}

describe('Catalog tool registry & runtime composition (007D)', () => {
  it('17. registered + allowlisted catalog tool executes', async () => {
    const registry = new InMemoryToolRegistry();
    const port = createFakePort();
    registry.registerTool(createCatalogSearchToolDefinition({ queryPort: port }));
    const snapshot = createSnapshot(['catalog.search']);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(snapshot),
    });
    const result = await engine.executeTool(
      { toolName: 'catalog.search', rawArguments: { query: 'Plano' } },
      { organizationId: ORG_A, snapshot },
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('18. unconfigured catalog tool is rejected by the allowlist boundary', async () => {
    const registry = new InMemoryToolRegistry();
    const port = createFakePort();
    registry.registerTool(createCatalogSearchToolDefinition({ queryPort: port }));
    registry.registerTool(createCatalogItemDetailToolDefinition({ queryPort: port }));
    const snapshot = createSnapshot(['catalog.search']);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(snapshot),
    });
    const result = await engine.executeTool(
      {
        toolName: 'catalog.item_detail',
        rawArguments: { sku: 'SKU-1' },
      },
      { organizationId: ORG_A, snapshot },
    );
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('UNAUTHORIZED_TOOL');
    }
  });

  it('19. configured but unregistered tool fails closed as unknown', async () => {
    const registry = new InMemoryToolRegistry();
    const snapshot = createSnapshot(['catalog.item_detail']);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(snapshot),
    });
    const result = await engine.executeTool(
      {
        toolName: 'catalog.item_detail',
        rawArguments: { sku: 'SKU-1' },
      },
      { organizationId: ORG_A, snapshot },
    );
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('UNKNOWN_TOOL');
    }
  });

  it('22. existing agent.operating_hours still executes through the engine', async () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(createOperatingHoursToolDefinition());
    const snapshot = createSnapshot(['agent.operating_hours']);
    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: createPublishedVersionToolAuthorizer(snapshot),
    });
    const result = await engine.executeTool(
      { toolName: 'agent.operating_hours', rawArguments: { query: 'Qual horário?' } },
      { organizationId: ORG_A, snapshot },
    );
    expect(result.status).toBe('SUCCESS');
  });
});
