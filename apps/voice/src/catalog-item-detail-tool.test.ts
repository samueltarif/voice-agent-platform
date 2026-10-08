import { describe, it, expect } from 'vitest';
import type { CatalogPublicItem } from '@voice-agent/contracts';
import { createCatalogItemDetailToolDefinition } from './catalog-item-detail-tool.js';
import type { CatalogQueryPort } from './catalog-query-port.js';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

const ITEM_A: CatalogPublicItem = {
  id: '33333333-3333-3333-3333-333333333333',
  kind: 'SERVICE',
  name: 'Instalação',
  description: null,
  sku: 'SKU-SERV-1',
  active: true,
  priceCents: null,
  currency: 'BRL',
};

function createScopedPort(): { port: CatalogQueryPort; received: Array<{ org: string }> } {
  const received: Array<{ org: string }> = [];
  const port: CatalogQueryPort = {
    searchCatalog: async () => [],
    getCatalogItem: async (input) => {
      received.push({ org: input.organizationId });
      if (input.organizationId !== ORG_A) {
        return null;
      }
      return ITEM_A;
    },
  };
  return { port, received };
}

describe('Catalog item detail tool (007D)', () => {
  it('12b. accepts itemId and returns sanitized detail', async () => {
    const { port, received } = createScopedPort();
    const tool = createCatalogItemDetailToolDefinition({ queryPort: port });
    expect(tool.validateInput({ itemId: ITEM_A.id }).success).toBe(true);
    const output = await tool.execute({ itemId: ITEM_A.id }, { organizationId: ORG_A });
    expect(output).toEqual({ found: true, item: ITEM_A });
    expect(received).toEqual([{ org: ORG_A }]);
  });

  it('13b. rejects empty args and organizationId override', () => {
    const { port } = createScopedPort();
    const tool = createCatalogItemDetailToolDefinition({ queryPort: port });
    expect(tool.validateInput({}).success).toBe(false);
    expect(tool.validateInput({ itemId: ITEM_A.id, organizationId: ORG_A }).success).toBe(false);
  });

  it('15. cross-tenant detail returns not-found without leaking item', async () => {
    const { port } = createScopedPort();
    const tool = createCatalogItemDetailToolDefinition({ queryPort: port });
    const output = await tool.execute({ itemId: ITEM_A.id }, { organizationId: ORG_B });
    expect(output).toEqual({ found: false, item: null });
  });
});
