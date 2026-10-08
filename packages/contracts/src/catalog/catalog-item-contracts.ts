import { z } from 'zod';

export const catalogItemKindSchema = z.enum(['PRODUCT', 'SERVICE']);
export type CatalogItemKind = z.infer<typeof catalogItemKindSchema>;

export const catalogCurrencySchema = z.string().regex(/^[A-Z]{3}$/, {
  message: 'Currency must be a 3-letter ISO code',
});

export const catalogPriceCentsSchema = z.number().int().min(0).nullable().optional();

export const catalogMoneySchema = z
  .object({
    priceCents: catalogPriceCentsSchema,
    currency: catalogCurrencySchema.default('BRL'),
  })
  .strict();

export type CatalogMoney = z.infer<typeof catalogMoneySchema>;

export const catalogSkuSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9/_-]*$/, {
    message: 'SKU must use letters, digits, slash, dash or underscore',
  });

export const catalogItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: catalogItemKindSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    sku: catalogSkuSchema.nullable().optional(),
    active: z.boolean(),
    priceCents: z.number().int().min(0).nullable().optional(),
    currency: catalogCurrencySchema,
  })
  .strict();

export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogPublicItemSchema = catalogItemSchema.omit({});
export type CatalogPublicItem = z.infer<typeof catalogPublicItemSchema>;

export const createCatalogItemInputSchema = z
  .object({
    kind: catalogItemKindSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    sku: catalogSkuSchema.nullable().optional(),
    active: z.boolean().default(true),
    priceCents: z.number().int().min(0).nullable().optional(),
    currency: catalogCurrencySchema.default('BRL'),
  })
  .strict();

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemInputSchema>;
