import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import { catalogItems, type CatalogItemKind } from '../schema/catalog.js';

export interface CreateCatalogItemInput {
  readonly organizationId: string;
  readonly kind: CatalogItemKind;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly sku?: string | null | undefined;
  readonly active?: boolean | undefined;
  readonly priceCents?: number | null | undefined;
  readonly currency?: string | undefined;
}

export interface SearchCatalogInput {
  readonly organizationId: string;
  readonly query?: string | undefined;
  readonly kind?: CatalogItemKind | undefined;
  readonly limit?: number | undefined;
}

export interface GetCatalogItemInput {
  readonly organizationId: string;
  readonly itemId?: string | undefined;
  readonly sku?: string | undefined;
}

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

function clampSearchLimit(limit?: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  if (limit < 1) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(limit, MAX_SEARCH_LIMIT);
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function buildTextConditions(query: string): SQL[] {
  const pattern = `%${escapeLikePattern(query.trim())}%`;
  return [
    ilike(catalogItems.name, pattern),
    ilike(catalogItems.description, pattern),
    ilike(catalogItems.sku, pattern),
  ];
}

export class CatalogRepository {
  constructor(private readonly db: DatabaseInstance) {}

  async createCatalogItem(input: CreateCatalogItemInput) {
    const [created] = await this.db
      .insert(catalogItems)
      .values({
        organizationId: input.organizationId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        sku: input.sku ?? null,
        active: input.active ?? true,
        priceCents: input.priceCents ?? null,
        currency: input.currency ?? 'BRL',
      })
      .returning();
    return created;
  }

  async getCatalogItem(input: GetCatalogItemInput) {
    if (input.itemId === undefined && input.sku === undefined) {
      throw new Error('Either itemId or sku must be provided');
    }
    const identityCondition =
      input.itemId !== undefined
        ? eq(catalogItems.id, input.itemId)
        : eq(catalogItems.sku, input.sku as string);
    const [found] = await this.db
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.organizationId, input.organizationId), identityCondition))
      .limit(1);
    return found ?? null;
  }

  async searchCatalog(input: SearchCatalogInput) {
    const limit = clampSearchLimit(input.limit);
    const baseConditions = [
      eq(catalogItems.organizationId, input.organizationId),
      eq(catalogItems.active, true),
    ];
    if (input.kind !== undefined) {
      baseConditions.push(eq(catalogItems.kind, input.kind));
    }
    const trimmedQuery = input.query?.trim();
    if (trimmedQuery) {
      baseConditions.push(or(...buildTextConditions(trimmedQuery)) as SQL);
    }
    return this.db
      .select()
      .from(catalogItems)
      .where(and(...baseConditions))
      .orderBy(asc(catalogItems.name), asc(catalogItems.id))
      .limit(limit);
  }
}
