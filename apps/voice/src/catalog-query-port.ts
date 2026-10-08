import type {
  CatalogItemDetailToolOutput,
  CatalogPublicItem,
  CatalogSearchToolOutput,
} from '@voice-agent/contracts';

export interface CatalogSearchPortInput {
  readonly query?: string | undefined;
  readonly kind?: 'PRODUCT' | 'SERVICE' | undefined;
  readonly limit?: number | undefined;
}

export interface CatalogItemDetailPortInput {
  readonly itemId?: string | undefined;
  readonly sku?: string | undefined;
}

export interface CatalogQueryPort {
  searchCatalog(input: {
    readonly organizationId: string;
    readonly query?: string | undefined;
    readonly kind?: 'PRODUCT' | 'SERVICE' | undefined;
    readonly limit?: number | undefined;
  }): Promise<readonly CatalogPublicItem[]>;

  getCatalogItem(input: {
    readonly organizationId: string;
    readonly itemId?: string | undefined;
    readonly sku?: string | undefined;
  }): Promise<CatalogPublicItem | null>;
}

export type { CatalogPublicItem, CatalogSearchToolOutput, CatalogItemDetailToolOutput };
