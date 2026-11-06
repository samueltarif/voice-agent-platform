import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { POST as archive } from './archive/route.js';
import { POST as reactivate } from './reactivate/route.js';
import {
  DELETE as discardDraft,
  PATCH as updateDraft,
  POST as createDraft,
} from './draft/route.js';
import { POST as publish } from './draft/publish/route.js';
import { GET as readConfiguration } from './versions/[versionId]/configuration/route.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../features/agents/agent-default-configuration.js';

vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const AGENT = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
/** Valores como o Next.js entrega depois de decodificar a URL uma vez. */
const HOSTILE_IDS = [
  'agent-1',
  '../../v1/organizations',
  '..',
  '%2e%2e',
  '%252e',
  'a/b',
  'a\\b',
  `${AGENT}/x`,
  `${AGENT}?x=1`,
  `${AGENT}#f`,
];

const tenantRequest = vi.fn();
type Handler = (req: NextRequest, ctx: never) => Promise<NextResponse>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(serverOrgContext, 'getServerOrganizationContext').mockResolvedValue({
    status: 'RESOLVED',
    context: { organizationId: 'org-1', slug: 'org-alpha', name: 'Org', role: 'OWNER' },
    user: { id: 'user-1', email: 'owner@example.test' },
    availableOrganizations: [],
  } as never);
  vi.spyOn(clientFactory, 'getInternalApiClient').mockReturnValue({ request: vi.fn() } as never);
  const { TenantApiClient } = await import('../../../../lib/api/tenant-api-client.js');
  vi.spyOn(TenantApiClient.prototype, 'request').mockImplementation(tenantRequest);
  tenantRequest.mockResolvedValue({ ok: true });
});

function call(handler: Handler, method: string, agentId: string, versionId: string | null) {
  const query = versionId === null ? '' : `?versionId=${encodeURIComponent(versionId)}`;
  const req = new NextRequest(`http://localhost:3000/api/agents/x${query}`, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    ...(method === 'PATCH' || method === 'POST'
      ? { body: JSON.stringify({ configuration: DEFAULT_AGENT_CONFIGURATION_V1 }) }
      : {}),
  });
  return handler(req, {
    params: Promise.resolve({ agentId, versionId: versionId ?? VERSION }),
  } as never);
}

const ROUTES: [string, Handler, string, boolean][] = [
  ['archive', archive as Handler, 'POST', false],
  ['reactivate', reactivate as Handler, 'POST', false],
  ['create draft', createDraft as Handler, 'POST', false],
  ['update draft', updateDraft as Handler, 'PATCH', true],
  ['discard draft', discardDraft as Handler, 'DELETE', true],
  ['publish', publish as Handler, 'POST', true],
];

describe('agent BFF routes — route ids never reach the internal API unsafely (F1)', () => {
  it.each(ROUTES)(
    '%s: hostile agentId → uniform 404 and no API call',
    async (_n, handler, method, needsVersion) => {
      for (const agentId of HOSTILE_IDS) {
        const res = await call(handler, method, agentId, needsVersion ? VERSION : null);
        expect(res.status, agentId).toBe(404);
        expect(await res.json()).toMatchObject({
          error: 'Agente ou versão do rascunho não encontrada.',
        });
      }
      expect(tenantRequest).not.toHaveBeenCalled();
    },
  );

  it.each(ROUTES.filter((r) => r[3]))(
    '%s: hostile versionId query → 404 and no API call',
    async (_n, handler, method) => {
      for (const versionId of HOSTILE_IDS) {
        const res = await call(handler, method, AGENT, versionId);
        expect(res.status, versionId).toBe(404);
      }
      expect(tenantRequest).not.toHaveBeenCalled();
    },
  );

  it('configuration route refuses hostile agent or version ids without calling the API', async () => {
    for (const id of HOSTILE_IDS) {
      for (const [agentId, versionId] of [
        [id, VERSION],
        [AGENT, id],
      ] as const) {
        const req = new NextRequest('http://localhost:3000/api/agents/x/versions/y/configuration', {
          headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
        });
        const res = await (readConfiguration as Handler)(req, {
          params: Promise.resolve({ agentId, versionId }),
        } as never);
        expect(res.status).toBe(404);
      }
    }
    expect(tenantRequest).not.toHaveBeenCalled();
  });

  it('valid ids keep the exact internal paths', async () => {
    await call(archive as Handler, 'POST', AGENT, null);
    await call(publish as Handler, 'POST', AGENT, VERSION);
    await call(discardDraft as Handler, 'DELETE', AGENT, VERSION);
    const paths = tenantRequest.mock.calls.map(([options]) => (options as { path: string }).path);
    expect(paths).toEqual([
      `/v1/agents/${AGENT}/archive`,
      `/v1/agents/${AGENT}/drafts/${VERSION}/publish`,
      `/v1/agents/${AGENT}/drafts/${VERSION}`,
    ]);
  });
});
