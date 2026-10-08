import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { createDatabaseConnection } from './client/connection.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { CatalogRepository } from './repositories/catalog-repository.js';
import { organizations } from './schema/organizations.js';
import { catalogItems } from './schema/catalog.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/voice_agent_dev';

describe('Catalog persistence & tenant isolation (007D Integration)', () => {
  const { db, pool } = createDatabaseConnection({ connectionString: testDbUrl });
  const orgRepo = new OrganizationRepository(db);
  const catalogRepo = new CatalogRepository(db);

  const runId = Math.random().toString(36).substring(2, 8);
  let orgAId = '';
  let orgBId = '';
  let productId = '';
  let serviceSku = '';
  let inactiveId = '';
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    const orgA = await orgRepo.createOrganization({
      slug: `cat-org-a-${runId}`,
      name: `Catalog Org A ${runId}`,
      status: 'ACTIVE',
    });
    const orgB = await orgRepo.createOrganization({
      slug: `cat-org-b-${runId}`,
      name: `Catalog Org B ${runId}`,
      status: 'ACTIVE',
    });
    if (!orgA || !orgB) {
      throw new Error('Failed to create catalog test organizations');
    }
    orgAId = orgA.id;
    orgBId = orgB.id;
    createdOrgIds.push(orgAId, orgBId);

    const product = await catalogRepo.createCatalogItem({
      organizationId: orgAId,
      kind: 'PRODUCT',
      name: `Plano Mensal ${runId}`,
      description: 'Plano base',
      sku: `SKU-PROD-${runId}`,
      priceCents: 29900,
      currency: 'BRL',
    });
    if (!product) {
      throw new Error('Failed to create catalog test product');
    }
    productId = product.id;

    const service = await catalogRepo.createCatalogItem({
      organizationId: orgAId,
      kind: 'SERVICE',
      name: `Instalação ${runId}`,
      description: null,
      sku: `SKU-SERV-${runId}`,
      priceCents: null,
    });
    if (!service || !service.sku) {
      throw new Error('Failed to create catalog test service');
    }
    serviceSku = service.sku;

    const inactive = await catalogRepo.createCatalogItem({
      organizationId: orgAId,
      kind: 'PRODUCT',
      name: `Ina-${runId} Legado`,
      sku: `SKU-INA-${runId}`,
      active: false,
      priceCents: 1000,
      currency: 'BRL',
    });
    if (!inactive) {
      throw new Error('Failed to create catalog inactive item');
    }
    inactiveId = inactive.id;

    await catalogRepo.createCatalogItem({
      organizationId: orgBId,
      kind: 'PRODUCT',
      name: `Plano OrgB ${runId}`,
      sku: `SKU-PROD-${runId}`,
      priceCents: 1000,
      currency: 'BRL',
    });

    for (const suffix of ['Charlie', 'Alpha', 'Bravo']) {
      await catalogRepo.createCatalogItem({
        organizationId: orgAId,
        kind: 'PRODUCT',
        name: `Ord-${runId}-${suffix}`,
        sku: `SKU-ORD-${runId}-${suffix}`,
        priceCents: 100,
        currency: 'BRL',
      });
    }
    for (let index = 0; index < 4; index += 1) {
      await catalogRepo.createCatalogItem({
        organizationId: orgAId,
        kind: 'SERVICE',
        name: `Lim-${runId}-Serv-${index}`,
        sku: `SKU-LIM-${runId}-${index}`,
        priceCents: null,
      });
    }
  });

  afterAll(async () => {
    await db.delete(catalogItems).where(inArray(catalogItems.organizationId, createdOrgIds));
    await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
    const leftoverItems = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(inArray(catalogItems.organizationId, createdOrgIds));
    const leftoverOrgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(inArray(organizations.id, createdOrgIds));
    expect([...leftoverItems, ...leftoverOrgs]).toEqual([]);
    await pool.end();
  });

  it('1. valid PRODUCT persists and reads by id', async () => {
    const found = await catalogRepo.getCatalogItem({ organizationId: orgAId, itemId: productId });
    expect(found?.kind).toBe('PRODUCT');
    expect(found?.name).toContain(runId);
  });

  it('2. valid SERVICE persists and reads by sku', async () => {
    const found = await catalogRepo.getCatalogItem({ organizationId: orgAId, sku: serviceSku });
    expect(found?.kind).toBe('SERVICE');
    expect(found?.priceCents).toBeNull();
  });

  it('3-5. cross-tenant lookup returns null without leaking existence', async () => {
    const crossById = await catalogRepo.getCatalogItem({
      organizationId: orgBId,
      itemId: productId,
    });
    expect(crossById).toBeNull();
    const crossSearch = await catalogRepo.searchCatalog({
      organizationId: orgBId,
      query: `Plano Mensal ${runId}`,
    });
    expect(crossSearch.map((item) => item.id)).not.toContain(productId);
  });

  it('4b. same sku across tenants resolves to the requesting tenant item', async () => {
    const foundB = await catalogRepo.getCatalogItem({
      organizationId: orgBId,
      sku: `SKU-PROD-${runId}`,
    });
    expect(foundB?.organizationId).toBe(orgBId);
    expect(foundB?.name).toContain('OrgB');
  });

  it('6-7. active items appear in search while inactive are excluded by default', async () => {
    const active = await catalogRepo.searchCatalog({
      organizationId: orgAId,
      query: `Plano Mensal ${runId}`,
    });
    expect(active.length).toBeGreaterThanOrEqual(1);
    const inactiveSearch = await catalogRepo.searchCatalog({
      organizationId: orgAId,
      query: `Ina-${runId}`,
    });
    expect(inactiveSearch).toEqual([]);
    const inactiveDetail = await catalogRepo.getCatalogItem({
      organizationId: orgAId,
      itemId: inactiveId,
    });
    expect(inactiveDetail?.active).toBe(false);
  });

  it('8. search result is bounded by the requested limit', async () => {
    const limited = await catalogRepo.searchCatalog({
      organizationId: orgAId,
      query: `Lim-${runId}`,
      limit: 2,
    });
    expect(limited).toHaveLength(2);
  });

  it('9. search ordering is deterministic by name then id', async () => {
    const ordered = await catalogRepo.searchCatalog({
      organizationId: orgAId,
      query: `Ord-${runId}`,
      limit: 10,
    });
    expect(ordered.map((item) => item.name)).toEqual([
      `Ord-${runId}-Alpha`,
      `Ord-${runId}-Bravo`,
      `Ord-${runId}-Charlie`,
    ]);
  });

  it('10. price is persisted exactly with explicit currency', async () => {
    const found = await catalogRepo.getCatalogItem({ organizationId: orgAId, itemId: productId });
    expect(found?.priceCents).toBe(29900);
    expect(found?.currency).toBe('BRL');
  });

  it('11. invalid money states are rejected by schema checks', async () => {
    await expect(
      catalogRepo.createCatalogItem({
        organizationId: orgAId,
        kind: 'PRODUCT',
        name: `Bad-${runId}`,
        priceCents: -5,
      }),
    ).rejects.toThrow();
    await expect(
      catalogRepo.createCatalogItem({
        organizationId: orgAId,
        kind: 'PRODUCT',
        name: `BadCur-${runId}`,
        priceCents: 100,
        currency: 'brl',
      }),
    ).rejects.toThrow();
  });

  it('12. lookup without identity is rejected fail-closed', async () => {
    await expect(catalogRepo.getCatalogItem({ organizationId: orgAId })).rejects.toThrow();
  });
});
