import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as importCsv } from './[listId]/imports/route.js';
import { GET as members } from './[listId]/members/route.js';
import { mockApi, operationsReq, params, resolveTenant } from '../operations-bff-test-kit.js';

vi.mock('../../../lib/organization/server-organization-context.js', () => ({
  getServerOrganizationContext: vi.fn(),
}));
vi.mock('../../../lib/api/api-client-factory.js', () => ({ getInternalApiClient: vi.fn() }));

const LIST = '9a8b7c6d-5e4f-4a3b-9c1d-0e1f2a3b4c5d';

describe('008-MVP2 BFF contact lists', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveTenant();
  });

  it('forwards a CSV import with its mapping and returns the report', async () => {
    const api = mockApi({ created: 1, rejected: [] });
    const body = { csv: 'Telefone\n11 91111-0001', mapping: { phoneColumn: 'Telefone' } };
    const res = await importCsv(
      operationsReq(`/api/contact-lists/${LIST}/imports`, { method: 'POST', body }),
      params({ listId: LIST }),
    );
    expect(await res.json()).toEqual({ created: 1, rejected: [] });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/contact-lists/${LIST}/imports`,
        body: { csv: body.csv, mapping: { phoneColumn: 'Telefone', variableColumns: [] } },
      }),
    );
  });

  it('accepts CSVs beyond the default JSON cap but refuses bodies above the import cap', async () => {
    const api = mockApi({ created: 0, rejected: [] });
    const post = (csv: string) =>
      importCsv(
        operationsReq(`/api/contact-lists/${LIST}/imports`, {
          method: 'POST',
          body: { csv, mapping: { phoneColumn: 'Telefone' } },
        }),
        params({ listId: LIST }),
      );
    expect((await post('Telefone\n' + '1'.repeat(200 * 1024))).status).toBe(200);
    expect((await post('Telefone\n' + '1'.repeat(5 * 1024 * 1024))).status).toBe(413);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('whitelists member query parameters', async () => {
    const api = mockApi([]);
    const res = await members(
      operationsReq(`/api/contact-lists/${LIST}/members?eligibility=ALL&limit=50&listId=x`),
      params({ listId: LIST }),
    );
    expect(await res.json()).toEqual({ members: [] });
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/contact-lists/${LIST}/members?eligibility=ALL&limit=50`,
      }),
    );
  });
});
