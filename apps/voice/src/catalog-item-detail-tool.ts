import {
  CATALOG_ITEM_DETAIL_TOOL_NAME,
  catalogItemDetailToolInputSchema,
  createZodToolValidator,
  type CatalogItemDetailToolInput,
  type CatalogItemDetailToolOutput,
  type CatalogPublicItem,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import type { CatalogQueryPort } from './catalog-query-port.js';

export interface CatalogItemDetailToolOptions {
  readonly queryPort: CatalogQueryPort;
}

function toPublicItem(item: CatalogPublicItem): CatalogPublicItem {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description ?? null,
    sku: item.sku ?? null,
    active: item.active,
    priceCents: item.priceCents ?? null,
    currency: item.currency,
  };
}

export function createCatalogItemDetailToolDefinition(
  options: CatalogItemDetailToolOptions,
): ToolDefinition<CatalogItemDetailToolInput, CatalogItemDetailToolOutput> {
  return {
    name: CATALOG_ITEM_DETAIL_TOOL_NAME,
    description: 'Detalhe determinístico de um item do catálogo do tenant.',
    validateInput: createZodToolValidator(catalogItemDetailToolInputSchema),
    execute: async (
      input: CatalogItemDetailToolInput,
      context: ToolExecutionContext,
    ): Promise<CatalogItemDetailToolOutput> => {
      const item = await options.queryPort.getCatalogItem({
        organizationId: context.organizationId,
        itemId: input.itemId,
        sku: input.sku,
      });
      if (!item) {
        return { found: false, item: null };
      }
      return { found: true, item: toPublicItem(item) };
    },
  };
}
