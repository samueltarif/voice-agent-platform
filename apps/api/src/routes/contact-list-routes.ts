import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { BadRequestError, ConflictError, NotFoundError } from '@voice-agent/errors';
import {
  CONTACT_CSV_LIMITS,
  contactCsvMappingSchema,
  createContactListInputSchema,
  planContactImport,
  renderRejectedRowsCsv,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant, type TenantPermission } from '../auth/tenant-authorization.js';

const listParams = z.object({ listId: z.string().uuid() });
const importBody = z
  .object({
    csv: z.string().min(1).max(CONTACT_CSV_LIMITS.maxBytes),
    mapping: contactCsvMappingSchema,
  })
  .strict();
const membersQuery = z.object({
  eligibility: z.enum(['ALL', 'ELIGIBLE']).default('ELIGIBLE'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function contactRepo(deps: ApiDependencies) {
  if (!deps.contactRepo) throw new Error('Contact repository not configured');
  return deps.contactRepo;
}

async function authorize(
  c: Parameters<typeof getServiceAuth>[0],
  deps: ApiDependencies,
  permission: TenantPermission,
) {
  const auth = getServiceAuth(c);
  await authorizeTenant({
    sub: auth.sub,
    orgId: auth.orgId,
    requiredPermission: permission,
    organizationRepo: deps.organizationRepo,
    membershipRepo: deps.membershipRepo,
  });
  return auth.orgId;
}

function registerListCrud(app: OpenAPIHono, deps: ApiDependencies): void {
  const security = [{ internalServiceAssertion: [] }];
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/contact-lists',
      summary: 'List contact lists',
      security,
      responses: { 200: { description: 'Contact lists' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'contacts.read');
      const lists = await contactRepo(deps).listLists(orgId);
      return c.json(
        lists.map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt.toISOString() })),
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/contact-lists',
      summary: 'Create a contact list',
      security,
      request: {
        body: { content: { 'application/json': { schema: createContactListInputSchema } } },
      },
      responses: { 201: { description: 'Created' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'contacts.manage');
      const body = c.req.valid('json' as never) as z.infer<typeof createContactListInputSchema>;
      const outcome = await contactRepo(deps).createList(orgId, body.name);
      if (outcome.kind === 'NAME_TAKEN')
        throw new ConflictError('A contact list with this name already exists.');
      return c.json({ id: outcome.list.id, name: outcome.list.name }, 201);
    },
  );
}

function registerImport(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/contact-lists/{listId}/imports',
      summary: 'Import contacts from CSV',
      security: [{ internalServiceAssertion: [] }],
      request: {
        params: listParams,
        body: { content: { 'application/json': { schema: importBody } } },
      },
      responses: { 200: { description: 'Import report' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'contacts.manage');
      const { listId } = c.req.valid('param' as never) as z.infer<typeof listParams>;
      const body = c.req.valid('json' as never) as z.infer<typeof importBody>;
      const plan = planContactImport(body.csv, body.mapping);
      if (!plan.ok) throw new BadRequestError(`CSV import rejected: ${plan.reason}`);
      const outcome = await contactRepo(deps).importIntoList({
        organizationId: orgId,
        listId,
        accepted: plan.accepted,
      });
      if (outcome.kind === 'LIST_NOT_FOUND') throw new NotFoundError('Contact list not found.');
      const { kind: _kind, ...totals } = outcome;
      return c.json(
        {
          ...totals,
          rejected: plan.rejected.map((r) => ({ rowNumber: r.rowNumber, reason: r.reason })),
          rejectedRowsCsv: renderRejectedRowsCsv(plan.rejected),
        },
        200,
      );
    },
  );
}

function registerMembers(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/contact-lists/{listId}/members',
      summary: 'List contact list members',
      security: [{ internalServiceAssertion: [] }],
      request: { params: listParams, query: membersQuery },
      responses: { 200: { description: 'Members (eligible by default)' } },
    }),
    async (c) => {
      const orgId = await authorize(c, deps, 'contacts.read');
      const { listId } = c.req.valid('param' as never) as z.infer<typeof listParams>;
      const query = c.req.valid('query' as never) as z.infer<typeof membersQuery>;
      const members = await contactRepo(deps).listMembers({
        organizationId: orgId,
        listId,
        ...query,
      });
      return c.json(members, 200);
    },
  );
}

/**
 * Teto do corpo da importação, aplicado ANTES do parsing JSON: o CSV tem até
 * `maxBytes`, e o escape JSON pode no máximo dobrar o tamanho (aspas, quebras).
 */
export const CONTACT_IMPORT_MAX_BODY_BYTES = CONTACT_CSV_LIMITS.maxBytes * 2 + 64 * 1024;

/** 008-MVP1 — listas de contatos e importação CSV (tenant via assertion de serviço). */
export function registerContactListRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  app.use(
    '/v1/contact-lists/:listId/imports',
    bodyLimit({
      maxSize: CONTACT_IMPORT_MAX_BODY_BYTES,
      onError: (c) => c.json({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413),
    }),
  );
  registerListCrud(app, deps);
  registerImport(app, deps);
  registerMembers(app, deps);
}
