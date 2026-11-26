import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  changeLeadStatusInputSchema,
  createLeadInputSchema,
  leadStatusSchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { projectLeadView } from './lead-projection.js';
import {
  authorizeScheduling,
  schedulingDeps,
  schedulingRejected,
  schedulingSecurity as security,
} from './scheduling-route-support.js';

const leadParams = z.object({ leadId: z.string().uuid() });
const listQuery = z.object({
  status: leadStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function registerCreateLead(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/leads',
      summary: 'Create (or return) the lead of an existing contact',
      security,
      request: { body: { content: { 'application/json': { schema: createLeadInputSchema } } } },
      responses: { 201: { description: 'Created' }, 200: { description: 'Already exists' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'leads.manage');
      const body = c.req.valid('json' as never) as z.infer<typeof createLeadInputSchema>;
      const outcome = await schedulingDeps(deps).leads.createLeadForContact({
        ...ctx,
        contactId: body.contactId,
      });
      if (outcome.kind === 'CONTACT_NOT_FOUND') return schedulingRejected(c, outcome.kind);
      return c.json(
        { status: outcome.kind, lead: outcome.lead },
        outcome.kind === 'CREATED' ? 201 : 200,
      );
    },
  );
}

function registerReadLeads(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/leads',
      summary: 'List leads of the organization',
      security,
      request: { query: listQuery },
      responses: { 200: { description: 'Leads' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'leads.read');
      const query = c.req.valid('query' as never) as z.infer<typeof listQuery>;
      const items = await schedulingDeps(deps).leads.listLeads({
        organizationId: ctx.organizationId,
        ...query,
      });
      return c.json({ items }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/leads/{leadId}',
      summary: 'Lead with status history',
      security,
      request: { params: leadParams },
      responses: { 200: { description: 'Lead' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'leads.read');
      const { leadId } = c.req.valid('param' as never) as z.infer<typeof leadParams>;
      const lead = await schedulingDeps(deps).leads.getLead(ctx.organizationId, leadId);
      if (!lead) return schedulingRejected(c, 'LEAD_NOT_FOUND');
      return c.json(projectLeadView(lead, ctx.meetingView), 200);
    },
  );
}

function registerChangeStatus(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/leads/{leadId}/status',
      summary: 'Change the commercial status of a lead',
      security,
      request: {
        params: leadParams,
        body: { content: { 'application/json': { schema: changeLeadStatusInputSchema } } },
      },
      responses: { 200: { description: 'Changed' }, 409: { description: 'Rejected' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'leads.manage');
      const { leadId } = c.req.valid('param' as never) as z.infer<typeof leadParams>;
      const body = c.req.valid('json' as never) as z.infer<typeof changeLeadStatusInputSchema>;
      const outcome = await schedulingDeps(deps).leads.changeLeadStatus({
        ...ctx,
        leadId,
        ...body,
      });
      // DO_NOT_CALL é opt-out: a supressão é sempre registrada; com reunião
      // ativa, ela é preservada até cancelamento explícito (auditoria A4).
      if ('lead' in outcome) return c.json({ status: outcome.kind, lead: outcome.lead }, 200);
      if (outcome.kind === 'BLOCKED')
        return schedulingRejected(c, 'STATUS_CHANGE_BLOCKED', outcome.reason);
      return schedulingRejected(c, outcome.kind === 'NOT_FOUND' ? 'LEAD_NOT_FOUND' : outcome.kind);
    },
  );
}

/** E1 (DEC-074) — leads ligados aos contatos do tenant. */
export function registerLeadRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerCreateLead(app, deps);
  registerReadLeads(app, deps);
  registerChangeStatus(app, deps);
}
