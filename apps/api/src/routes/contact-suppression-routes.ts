import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { BadRequestError } from '@voice-agent/errors';
import { createContactSuppressionInputSchema, normalizeContactPhone } from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { getServiceAuth } from '../auth/service-auth-middleware.js';
import { authorizeTenant } from '../auth/tenant-authorization.js';

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function suppressionRepo(deps: ApiDependencies) {
  if (!deps.suppressionRepo) throw new Error('Suppression repository not configured');
  return deps.suppressionRepo;
}

const toDto = (s: {
  phoneE164: string;
  reason: string;
  evidenceReference: string | null;
  createdAt: Date;
}) => ({
  phoneE164: s.phoneE164,
  reason: s.reason,
  evidenceReference: s.evidenceReference,
  createdAt: s.createdAt.toISOString(),
});

const security = [{ internalServiceAssertion: [] }];

function registerCreateSuppression(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/contact-suppressions',
      summary: 'Suppress a phone number',
      security,
      request: {
        body: { content: { 'application/json': { schema: createContactSuppressionInputSchema } } },
      },
      responses: { 201: { description: 'Suppressed' }, 200: { description: 'Already suppressed' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      const tenant = await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'contacts.suppress',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });
      const body = c.req.valid('json' as never) as z.infer<
        typeof createContactSuppressionInputSchema
      >;
      const phone = normalizeContactPhone(body.phone);
      if (!phone.ok) throw new BadRequestError(`Invalid phone number: ${phone.reason}`);
      const outcome = await suppressionRepo(deps).addSuppression({
        organizationId: tenant.organizationId,
        phoneE164: phone.e164,
        reason: body.reason,
        evidenceReference: body.evidenceReference,
        createdByUserId: tenant.userId,
      });
      return c.json(
        { status: outcome.kind, suppression: toDto(outcome.suppression) },
        outcome.kind === 'SUPPRESSED' ? 201 : 200,
      );
    },
  );
}

function registerListSuppressions(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/contact-suppressions',
      summary: 'List suppressions',
      security,
      request: { query: pageQuery },
      responses: { 200: { description: 'Suppressions' } },
    }),
    async (c) => {
      const auth = getServiceAuth(c);
      await authorizeTenant({
        sub: auth.sub,
        orgId: auth.orgId,
        requiredPermission: 'contacts.read',
        organizationRepo: deps.organizationRepo,
        membershipRepo: deps.membershipRepo,
      });
      const { limit, offset } = c.req.valid('query' as never) as z.infer<typeof pageQuery>;
      const rows = await suppressionRepo(deps).listSuppressions(auth.orgId, limit, offset);
      return c.json(rows.map(toDto), 200);
    },
  );
}

/** 008-MVP1 — supressões (opt-out / não perturbe / manual) por tenant; sem remoção. */
export function registerContactSuppressionRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerCreateSuppression(app, deps);
  registerListSuppressions(app, deps);
}
