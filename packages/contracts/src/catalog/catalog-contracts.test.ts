import { describe, it, expect } from 'vitest';
import {
  agentConfigurationSnapshotV1Schema,
  agentToolsV1Schema,
  canonicalToolNameSchema,
} from '../agents/agent-configuration-v1.js';
import {
  catalogItemKindSchema,
  catalogMoneySchema,
  createCatalogItemInputSchema,
} from './catalog-item-contracts.js';
import {
  CATALOG_ITEM_DETAIL_TOOL_NAME,
  CATALOG_SEARCH_TOOL_NAME,
  catalogItemDetailToolInputSchema,
  catalogSearchToolInputSchema,
} from './catalog-tool-contracts.js';

const baseSnapshot = {
  persona: {
    role: 'Atendente',
    companyName: 'Empresa',
    objective: 'Atender',
    tone: 'FORMAL' as const,
    greetingPhrase: 'Olá',
    closingPhrase: 'Tchau',
    fallbackPhrase: 'Repita',
  },
  voice: { languageCode: 'pt-BR' as const },
  rules: { conversational: ['Seja cordial'], deterministic: {} },
};

describe('Catalog contracts (007D)', () => {
  it('1. accepts PRODUCT and SERVICE kinds', () => {
    expect(catalogItemKindSchema.parse('PRODUCT')).toBe('PRODUCT');
    expect(catalogItemKindSchema.parse('SERVICE')).toBe('SERVICE');
  });

  it('2. accepts valid item input with integer price and BRL currency', () => {
    const parsed = createCatalogItemInputSchema.safeParse({
      kind: 'PRODUCT',
      name: 'Plano Mensal',
      priceCents: 29900,
      currency: 'BRL',
    });
    expect(parsed.success).toBe(true);
  });

  it('3. models priceless items explicitly with null price', () => {
    const parsed = createCatalogItemInputSchema.safeParse({
      kind: 'SERVICE',
      name: 'Avaliação gratuita',
      priceCents: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priceCents ?? null).toBeNull();
    }
  });

  it('4. rejects negative price and non-integer money', () => {
    expect(
      createCatalogItemInputSchema.safeParse({
        kind: 'PRODUCT',
        name: 'Item',
        priceCents: -100,
      }).success,
    ).toBe(false);
    expect(
      createCatalogItemInputSchema.safeParse({
        kind: 'PRODUCT',
        name: 'Item',
        priceCents: 10.5,
      }).success,
    ).toBe(false);
    expect(catalogMoneySchema.safeParse({ priceCents: 100, currency: 'brl' }).success).toBe(false);
  });

  it('5. search tool accepts valid args and rejects organizationId override', () => {
    expect(catalogSearchToolInputSchema.safeParse({ query: 'plano', limit: 5 }).success).toBe(true);
    expect(catalogSearchToolInputSchema.safeParse({ organizationId: 'org-1' }).success).toBe(false);
    expect(catalogSearchToolInputSchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('6. detail tool requires itemId or sku and rejects empty args', () => {
    expect(
      catalogItemDetailToolInputSchema.safeParse({
        itemId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
    expect(catalogItemDetailToolInputSchema.safeParse({ sku: 'SKU-1' }).success).toBe(true);
    expect(catalogItemDetailToolInputSchema.safeParse({}).success).toBe(false);
  });

  it('7. canonical catalog names are accepted by AgentVersion toolset schema', () => {
    expect(canonicalToolNameSchema.parse(CATALOG_SEARCH_TOOL_NAME)).toBe('catalog.search');
    expect(canonicalToolNameSchema.parse(CATALOG_ITEM_DETAIL_TOOL_NAME)).toBe(
      'catalog.item_detail',
    );
    expect(agentToolsV1Schema.safeParse(['catalog.search', 'catalog.item_detail']).success).toBe(
      true,
    );
    const snapshot = agentConfigurationSnapshotV1Schema.safeParse({
      ...baseSnapshot,
      tools: ['catalog.search'],
    });
    expect(snapshot.success).toBe(true);
  });

  it('8. unknown canonical tool remains rejected', () => {
    expect(() => canonicalToolNameSchema.parse('catalog.booking')).toThrow();
    expect(agentToolsV1Schema.safeParse(['catalog.booking']).success).toBe(false);
  });
});
