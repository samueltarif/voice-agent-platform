import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import * as serverOrgContext from '../../../../lib/organization/server-organization-context.js';
import * as clientFactory from '../../../../lib/api/api-client-factory.js';
import { InternalApiClient } from '../../../../lib/api/internal-api-client.js';
import { POST as archive } from './archive/route.js';
import { POST as reactivate } from './reactivate/route.js';
import {
  DELETE as discardDraft,
  PATCH as updateDraft,
  POST as createDraft,
} from './draft/route.js';
import { POST as publish } from './draft/publish/route.js';
import { DEFAULT_AGENT_CONFIGURATION_V1 } from '../../../../features/agents/agent-default-configuration.js';

/**
 * NB-2 (revisão da #148): ordem dos controles de segurança nas rotas BFF de escrita
 * quando o agentId é hostil. Usa o InternalApiClient real com fetch simulado: a recusa
 * é provada pela ausência de qualquer chamada de rede, e o caso positivo pelo URL exato
 * e pela organização assinada na assertion (sempre a da sessão).
 */
vi.mock('../../../../lib/organization/server-organization-context.js');
vi.mock('../../../../lib/api/api-client-factory.js');

const BASE = 'http://api.internal:3002';
const AGENT = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const HOSTILE = ['../../v1/organizations', '..', '%2e%2e', 'a/b', 'a\\b', `${AGENT}?x=1`];
const SESSION_ORG = 'org-session';
const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
const { privateKey } = generateKeyPairSync('ed25519');

type Handler = (req: NextRequest, ctx: never) => Promise<NextResponse>;
type Route = [name: string, handler: Handler, method: string, suffix: string, denied: string];
const ROUTES: Route[] = [
  ['archive', archive as Handler, 'POST', '/archive', 'MANAGER'],
  ['reactivate', reactivate as Handler, 'POST', '/reactivate', 'MANAGER'],
  ['create draft', createDraft as Handler, 'POST', '/drafts', 'OPERATOR'],
  ['update draft', updateDraft as Handler, 'PATCH', `/drafts/${VERSION}`, 'VIEWER'],
  ['discard draft', discardDraft as Handler, 'DELETE', `/drafts/${VERSION}`, 'OPERATOR'],
  ['publish', publish as Handler, 'POST', `/drafts/${VERSION}/publish`, 'MANAGER'],
];

function session(role: string | null): void {
  const value =
    role === null
      ? { status: 'UNAUTHENTICATED', availableOrganizations: [] }
      : {
          status: 'RESOLVED',
          context: { organizationId: SESSION_ORG, slug: 'org-a', name: 'Org', role },
          user: { id: 'user-1', email: 'u@example.test' },
          availableOrganizations: [],
        };
  vi.mocked(serverOrgContext.getServerOrganizationContext).mockResolvedValue(value as never);
}

function call(route: Route, agentId: string, origin = 'http://localhost:3000') {
  const [, handler, method] = route;
  const req = new NextRequest(`http://localhost:3000/api/agents/x?versionId=${VERSION}`, {
    method,
    headers: { host: 'localhost:3000', origin, 'content-type': 'application/json' },
    ...(method === 'DELETE'
      ? {}
      : { body: JSON.stringify({ configuration: DEFAULT_AGENT_CONFIGURATION_V1 }) }),
  });
  return handler(req, { params: Promise.resolve({ agentId }) } as never);
}

function signedOrganization(init: RequestInit): unknown {
  const token = String((init.headers as Record<string, string>).Authorization).split(' ')[1]!;
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).orgId;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clientFactory.getInternalApiClient).mockReturnValue(
    new InternalApiClient({
      baseUrl: BASE,
      privateJwk: privateKey.export({ format: 'jwk' }),
      kid: 'k1',
      fetchFn,
    }),
  );
});

describe('agent write routes — security precedence with hostile agentId (NB-2)', () => {
  it.each(ROUTES)('%s: cross-site request is refused before session lookup', async (...r) => {
    session('OWNER');
    for (const id of HOSTILE) {
      const res = await call(r, id, 'https://evil.example');
      expect(res.status, id).toBe(403);
      expect(await res.json()).toEqual({ error: 'Origem da requisição não autorizada.' });
    }
    expect(serverOrgContext.getServerOrganizationContext).not.toHaveBeenCalled();
    expect(clientFactory.getInternalApiClient).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: missing session wins over the hostile id (401)', async (...r) => {
    session(null);
    for (const id of HOSTILE) {
      const res = await call(r, id);
      expect(res.status, id).toBe(401);
      expect(await res.json()).toEqual({ error: 'Sessão não autenticada.' });
    }
    expect(clientFactory.getInternalApiClient).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: insufficient role wins over the hostile id (403)', async (...r) => {
    session(r[4]);
    const bodies = new Set<string>();
    for (const id of HOSTILE) {
      const res = await call(r, id);
      expect(res.status, id).toBe(403);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ code: 'FORBIDDEN' });
      expect(text).not.toContain(id);
      bodies.add(text);
    }
    expect(bodies.size).toBe(1);
    expect(clientFactory.getInternalApiClient).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: authorized hostile id → uniform 404, no network', async (...r) => {
    session('OWNER');
    const bodies = new Set<string>();
    for (const id of HOSTILE) {
      const res = await call(r, id);
      expect(res.status, id).toBe(404);
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: valid UUID reaches the exact endpoint for the session org', async (...r) => {
    session('OWNER');
    const res = await call(r, AGENT);
    expect(res.status).toBeLessThan(300);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/agents/${AGENT}${r[3]}`);
    expect(init.method).toBe(r[2]);
    expect(signedOrganization(init)).toBe(SESSION_ORG);
  });
});
