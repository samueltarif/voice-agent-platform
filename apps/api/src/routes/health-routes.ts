import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

export function registerHealthRoutes(app: OpenAPIHono) {
  const healthRoute = createRoute({
    method: 'get',
    path: '/healthz',
    summary: 'Service Health Probe',
    description: 'Public liveness check returning minimal status with zero internal details',
    responses: {
      200: {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: z.object({
              status: z.literal('ok'),
            }),
          },
        },
      },
    },
  });

  app.openapi(healthRoute, (c) => {
    return c.json({ status: 'ok' as const }, 200);
  });
}
