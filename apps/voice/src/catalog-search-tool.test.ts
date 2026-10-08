import { describe, it, expect } from 'vitest';
import type { CatalogPublicItem } from '@voice-agent/contracts';
import { createCatalogSearchToolDefinition } from './catalog-search-tool.js';
import type { CatalogQueryPort } from './catalog-query-port.js';

const ORG_A = '11111111-1111-1111-1111-111111111111';

function createFakePort(items: readonly CatalogPublicItem[]): {
  port: CatalogQueryPort;
  receivedOrgIds: string[];
} {
  const receivedOrgIds: string[] = [];
  const port: CatalogQueryPort = {
    searchCatalog: async (input) => {
      receivedOrgIds.push(input.organizationId);
      return items.filter((item) => input.query === undefined || item.name.includes(input.query));
    },
    getCatalogItem: async () => null,
  };
  return { port, receivedOrgIds };
}

describe('Catalog search tool (007D)', () => {
  it('12. accepts valid arguments and returns sanitized items', async () => {
    const item = {
      id: '22222222-2222-2222-2222-222222222222',
      kind: 'PRODUCT',
      name: 'Plano Mensal',
      description: 'Plano base',
      sku: 'SKU-1',
      active: true,
      priceCents: 29900,
      currency: 'BRL',
      organizationId: ORG_A,
      internalNotes: 'secret',
    } as unknown as CatalogPublicItem;
    const { port, receivedOrgIds } = createFakePort([item]);
    const tool = createCatalogSearchToolDefinition({ queryPort: port });
    const validation = tool.validateInput({ query: 'Plano', limit: 5 });
    expect(validation.success).toBe(true);
    const output = await tool.execute({ query: 'Plano', limit: 5 }, { organizationId: ORG_A });
    expect(output.items).toHaveLength(1);
    expect(output.items[0]).toEqual({
      id: item.id,
      kind: 'PRODUCT',
      name: 'Plano Mensal',
      description: 'Plano base',
      sku: 'SKU-1',
      active: true,
      priceCents: 29900,
      currency: 'BRL',
    });
    expect(receivedOrgIds).toEqual([ORG_A]);
  });

  it('13-14. rejects malformed args and organizationId override', async () => {
    const { port } = createFakePort([]);
    const tool = createCatalogSearchToolDefinition({ queryPort: port });
    expect(tool.validateInput({ limit: 500 }).success).toBe(false);
    expect(tool.validateInput({ organizationId: ORG_A }).success).toBe(false);
    expect(tool.validateInput({ query: 123 }).success).toBe(false);
  });

  it('16. returns authorized empty result without leaking internals', async () => {
    const { port } = createFakePort([]);
    const tool = createCatalogSearchToolDefinition({ queryPort: port });
    const output = await tool.execute({ limit: 10 }, { organizationId: ORG_A });
    expect(output).toEqual({ items: [] });
  });
});
