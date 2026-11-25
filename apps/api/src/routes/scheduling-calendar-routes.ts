import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  createCalendarInputSchema,
  formatLocalTime,
  updateCalendarPolicyInputSchema,
} from '@voice-agent/contracts';
import type { CalendarVersionedOutcome } from '@voice-agent/database';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import {
  authorizeScheduling,
  schedulingDeps,
  schedulingRejected,
  schedulingSecurity as security,
} from './scheduling-route-support.js';

export const calendarParams = z.object({ calendarId: z.string().uuid() });

/** Resposta única para mudanças versionadas da agenda. */
export function calendarVersionedResponse(c: Context, outcome: CalendarVersionedOutcome) {
  if (outcome.kind === 'UPDATED') return c.json({ calendar: outcome.calendar }, 200);
  return schedulingRejected(c, outcome.kind === 'NOT_FOUND' ? 'CALENDAR_NOT_FOUND' : outcome.kind);
}

function registerCreateCalendar(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/scheduling/calendars',
      summary: 'Create a scheduling calendar',
      security,
      request: { body: { content: { 'application/json': { schema: createCalendarInputSchema } } } },
      responses: { 201: { description: 'Created' }, 409: { description: 'Name taken' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.manage');
      const { name, ...policy } = c.req.valid('json' as never) as z.infer<
        typeof createCalendarInputSchema
      >;
      const outcome = await schedulingDeps(deps).calendars.createCalendar({ ...ctx, name, policy });
      if (outcome.kind === 'NAME_TAKEN') return schedulingRejected(c, outcome.kind);
      return c.json({ calendar: outcome.calendar }, 201);
    },
  );
}

function registerReadCalendars(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/scheduling/calendars',
      summary: 'List calendars',
      security,
      responses: { 200: { description: 'Calendars' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.read');
      return c.json(
        { items: await schedulingDeps(deps).calendars.listCalendars(ctx.organizationId) },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/scheduling/calendars/{calendarId}',
      summary: 'Calendar with weekly availability and exceptions',
      security,
      request: { params: calendarParams },
      responses: { 200: { description: 'Calendar' }, 404: { description: 'Not found' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.read');
      const { calendarId } = c.req.valid('param' as never) as z.infer<typeof calendarParams>;
      const detail = await schedulingDeps(deps).calendars.getCalendar(
        ctx.organizationId,
        calendarId,
      );
      if (!detail) return schedulingRejected(c, 'CALENDAR_NOT_FOUND');
      const rules = detail.rules.map((r) => ({
        weekday: r.weekday,
        start: formatLocalTime(r.startMinute),
        end: formatLocalTime(r.endMinute),
      }));
      return c.json({ calendar: detail.calendar, rules, exceptions: detail.exceptions }, 200);
    },
  );
}

function registerUpdatePolicy(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'put',
      path: '/v1/scheduling/calendars/{calendarId}/policy',
      summary: 'Update timezone, duration, buffer, notice and horizon',
      security,
      request: {
        params: calendarParams,
        body: { content: { 'application/json': { schema: updateCalendarPolicyInputSchema } } },
      },
      responses: { 200: { description: 'Updated' }, 409: { description: 'Version conflict' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.manage');
      const { calendarId } = c.req.valid('param' as never) as z.infer<typeof calendarParams>;
      const { expectedVersion, ...policy } = c.req.valid('json' as never) as z.infer<
        typeof updateCalendarPolicyInputSchema
      >;
      const outcome = await schedulingDeps(deps).calendars.updatePolicy({
        ...ctx,
        calendarId,
        expectedVersion,
        policy,
      });
      return calendarVersionedResponse(c, outcome);
    },
  );
}

/** E1 (DEC-074) — agendas da organização e sua política. */
export function registerSchedulingCalendarRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerCreateCalendar(app, deps);
  registerReadCalendars(app, deps);
  registerUpdatePolicy(app, deps);
}
