import {
  CATALOG_SEARCH_TOOL_NAME,
  catalogSearchToolInputSchema,
  createZodToolValidator,
  type CatalogPublicItem,
  type CatalogSearchToolInput,
  type CatalogSearchToolOutput,
  type ToolDefinition,
  type ToolExecutionContext,
} from '@voice-agent/contracts';
import type { CatalogQueryPort } from './catalog-query-port.js';

export interface CatalogSearchToolOptions {
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

export function createCatalogSearchToolDefinition(
  options: CatalogSearchToolOptions,
): ToolDefinition<CatalogSearchToolInput, CatalogSearchToolOutput> {
  return {
    name: CATALOG_SEARCH_TOOL_NAME,
    description: 'Busca determinística de produtos e serviços do catálogo do tenant.',
    validateInput: createZodToolValidator(catalogSearchToolInputSchema),
    execute: async (
      input: CatalogSearchToolInput,
      context: ToolExecutionContext,
    ): Promise<CatalogSearchToolOutput> => {
      const items = await options.queryPort.searchCatalog({
        organizationId: context.organizationId,
        query: input.query,
        kind: input.kind,
        limit: input.limit,
      });
      return { items: items.map(toPublicItem) };
    },
  };
}
