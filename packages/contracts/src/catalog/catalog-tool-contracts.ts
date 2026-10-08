import { z } from 'zod';
import { catalogItemKindSchema, catalogPublicItemSchema } from './catalog-item-contracts.js';

export const CATALOG_SEARCH_TOOL_NAME = 'catalog.search' as const;
export const CATALOG_ITEM_DETAIL_TOOL_NAME = 'catalog.item_detail' as const;

export const CATALOG_CANONICAL_TOOL_NAMES = [
  CATALOG_SEARCH_TOOL_NAME,
  CATALOG_ITEM_DETAIL_TOOL_NAME,
] as const;

export type CatalogCanonicalToolName = (typeof CATALOG_CANONICAL_TOOL_NAMES)[number];

export const catalogSearchToolInputSchema = z
  .object({
    query: z.string().min(1).max(200).optional(),
    kind: catalogItemKindSchema.optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type CatalogSearchToolInput = z.infer<typeof catalogSearchToolInputSchema>;

export const catalogItemDetailToolInputSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    sku: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((value) => value.itemId !== undefined || value.sku !== undefined, {
    message: 'Either itemId or sku must be provided',
  });

export type CatalogItemDetailToolInput = z.infer<typeof catalogItemDetailToolInputSchema>;

export const catalogSearchToolOutputSchema = z
  .object({
    items: z.array(catalogPublicItemSchema),
  })
  .strict();

export type CatalogSearchToolOutput = z.infer<typeof catalogSearchToolOutputSchema>;

export const catalogItemDetailToolOutputSchema = z
  .object({
    found: z.boolean(),
    item: catalogPublicItemSchema.nullable(),
  })
  .strict();

export type CatalogItemDetailToolOutput = z.infer<typeof catalogItemDetailToolOutputSchema>;
