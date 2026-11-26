import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createAvailabilityExceptionInputSchema,
  replaceWeeklyAvailabilityInputSchema,
  slotQuerySchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import { calendarParams, calendarVersionedResponse } from './scheduling-calendar-routes.js';
import {
  authorizeScheduling,
  schedulingDeps,
  schedulingRejected,
  schedulingSecurity as security,
} from './scheduling-route-support.js';

const exceptionParams = calendarParams.extend({ exceptionId: z.string().uuid() });
const versionQuery = z.object({ expectedVersion: z.coerce.number().int().positive() });

function registerReplaceAvailability(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/scheduling/calendars/{calendarId}/availability',
      summary: 'Replace the weekly availability (local HH:MM windows)',
      security,
      request: {
        params: calendarParams,
        body: { content: { 'application/json': { schema: replaceWeeklyAvailabilityInputSchema } } },
      },
      responses: { 200: { description: 'Replaced' }, 409: { description: 'Version conflict' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.manage');
      const { calendarId } = c.req.valid('param' as never) as z.infer<typeof calendarParams>;
      const body = c.req.valid('json' as never) as z.infer<
        typeof replaceWeeklyAvailabilityInputSchema
      >;
      const outcome = await schedulingDeps(deps).availability.replaceWeeklyAvailability({
        ...ctx,
        calendarId,
        ...body,
      });
      return calendarVersionedResponse(c, outcome);
    },
  );
}

function registerAddException(app: OpenAPIHono, deps: ApiDependencies): void {
  const bodySchema = z.object({
    expectedVersion: z.number().int().positive(),
    exception: createAvailabilityExceptionInputSchema,
  });
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/scheduling/calendars/{calendarId}/exceptions',
      summary: 'Block a date (whole day or window) or add extra hours',
      security,
      request: {
        params: calendarParams,
        body: { content: { 'application/json': { schema: bodySchema } } },
      },
      responses: { 200: { description: 'Added' }, 409: { description: 'Version conflict' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.manage');
      const { calendarId } = c.req.valid('param' as never) as z.infer<typeof calendarParams>;
      const body = c.req.valid('json' as never) as z.infer<typeof bodySchema>;
      const outcome = await schedulingDeps(deps).availability.addException({
        ...ctx,
        calendarId,
        ...body,
      });
      return calendarVersionedResponse(c, outcome);
    },
  );
}

function registerRemoveException(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/v1/scheduling/calendars/{calendarId}/exceptions/{exceptionId}',
      summary: 'Remove an availability exception',
      security,
      request: { params: exceptionParams, query: versionQuery },
      responses: { 200: { description: 'Removed' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.manage');
      const params = c.req.valid('param' as never) as z.infer<typeof exceptionParams>;
      const { expectedVersion } = c.req.valid('query' as never) as z.infer<typeof versionQuery>;
      const outcome = await schedulingDeps(deps).availability.removeException({
        ...ctx,
        ...params,
        expectedVersion,
      });
      return calendarVersionedResponse(c, outcome);
    },
  );
}

function registerSlots(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/scheduling/calendars/{calendarId}/slots',
      summary: 'Free slots (read-only; nothing is reserved)',
      security,
      request: { params: calendarParams, query: slotQuerySchema },
      responses: { 200: { description: 'Slots' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.read');
      const { calendarId } = c.req.valid('param' as never) as z.infer<typeof calendarParams>;
      const query = c.req.valid('query' as never) as z.infer<typeof slotQuerySchema>;
      const scheduling = schedulingDeps(deps);
      const slots = await scheduling.slots.listSlots({
        organizationId: ctx.organizationId,
        calendarId,
        from: new Date(query.from),
        to: new Date(query.to),
        limit: query.limit,
        now: scheduling.now(),
      });
      return slots ? c.json({ items: slots }, 200) : schedulingRejected(c, 'CALENDAR_NOT_FOUND');
    },
  );
}

/** E1 (DEC-074) — disponibilidade semanal, exceções e horários livres. */
export function registerSchedulingAvailabilityRoutes(
  app: OpenAPIHono,
  deps: ApiDependencies,
): void {
  registerReplaceAvailability(app, deps);
  registerAddException(app, deps);
  registerRemoveException(app, deps);
  registerSlots(app, deps);
}
