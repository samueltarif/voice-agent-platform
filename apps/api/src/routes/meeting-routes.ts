import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import {
  bookMeetingInputSchema,
  cancelMeetingInputSchema,
  meetingListQuerySchema,
} from '@voice-agent/contracts';
import type { ApiDependencies } from '../composition/agent-dependencies.js';
import {
  authorizeScheduling,
  schedulingDeps,
  schedulingRejected,
  schedulingSecurity as security,
} from './scheduling-route-support.js';

const meetingParams = z.object({ meetingId: z.string().uuid() });

function registerBookMeeting(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/scheduling/meetings',
      summary: 'Book a meeting (re-validated against availability inside the transaction)',
      security,
      request: { body: { content: { 'application/json': { schema: bookMeetingInputSchema } } } },
      responses: {
        201: { description: 'Booked' },
        200: { description: 'Replayed (same idempotency key and request)' },
        409: { description: 'Rejected' },
      },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.book');
      const body = c.req.valid('json' as never) as z.infer<typeof bookMeetingInputSchema>;
      const scheduling = schedulingDeps(deps);
      const outcome = await scheduling.booking.bookMeeting({
        ...ctx,
        ...body,
        startsAt: new Date(body.startsAt),
        now: scheduling.now(),
      });
      if (outcome.kind === 'BOOKED' || outcome.kind === 'REPLAYED') {
        return c.json(
          { status: outcome.kind, meeting: outcome.meeting },
          outcome.kind === 'BOOKED' ? 201 : 200,
        );
      }
      return schedulingRejected(c, outcome.kind, 'reason' in outcome ? outcome.reason : undefined);
    },
  );
}

function registerListMeetings(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/scheduling/meetings',
      summary: 'Meetings overlapping a period',
      security,
      request: { query: meetingListQuerySchema },
      responses: { 200: { description: 'Meetings' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.read');
      const query = c.req.valid('query' as never) as z.infer<typeof meetingListQuerySchema>;
      const rows = await schedulingDeps(deps).meetings.listMeetings({
        organizationId: ctx.organizationId,
        calendarId: query.calendarId,
        from: new Date(query.from),
        to: new Date(query.to),
      });
      const items = rows.map((row) => ({
        ...row.meeting,
        contactName: row.contactName,
        leadStatus: row.leadStatus,
      }));
      return c.json({ items }, 200);
    },
  );
}

function registerCancelMeeting(app: OpenAPIHono, deps: ApiDependencies): void {
  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/scheduling/meetings/{meetingId}/cancel',
      summary: 'Cancel a meeting and free its slot',
      security,
      request: {
        params: meetingParams,
        body: { content: { 'application/json': { schema: cancelMeetingInputSchema } } },
      },
      responses: { 200: { description: 'Canceled' }, 409: { description: 'Version conflict' } },
    }),
    async (c) => {
      const ctx = await authorizeScheduling(c, deps, 'scheduling.book');
      const { meetingId } = c.req.valid('param' as never) as z.infer<typeof meetingParams>;
      const body = c.req.valid('json' as never) as z.infer<typeof cancelMeetingInputSchema>;
      const scheduling = schedulingDeps(deps);
      const outcome = await scheduling.cancellation.cancelMeeting({
        ...ctx,
        meetingId,
        ...body,
        now: scheduling.now(),
      });
      if (outcome.kind === 'CANCELED' || outcome.kind === 'ALREADY_CANCELED') {
        return c.json({ status: outcome.kind, meeting: outcome.meeting }, 200);
      }
      return schedulingRejected(
        c,
        outcome.kind === 'NOT_FOUND' ? 'MEETING_NOT_FOUND' : outcome.kind,
      );
    },
  );
}

/** E1 (DEC-074) — reuniões: reservar, listar e cancelar. */
export function registerMeetingRoutes(app: OpenAPIHono, deps: ApiDependencies): void {
  registerBookMeeting(app, deps);
  registerListMeetings(app, deps);
  registerCancelMeeting(app, deps);
}
