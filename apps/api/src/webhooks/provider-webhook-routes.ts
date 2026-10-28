import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { handleProviderWebhook, type ProviderWebhookChannel } from './provider-webhook-pipeline.js';
import type { ProviderWebhookDependencies } from './provider-webhook-ports.js';

/** Teto do corpo bruto; entregas maiores são recusadas antes de qualquer parsing. */
export const PROVIDER_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

const CHANNEL_PATHS: ReadonlyArray<readonly [string, ProviderWebhookChannel]> = [
  ['events', 'CALL_STATUS'],
  ['tools', 'TOOL_INVOCATION'],
];

function lowerCaseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/**
 * 008-OF4 — rotas de ingress de provedores. NÃO são montadas em `createApp`:
 * expor endpoint público exige autorização humana explícita (webhooks públicos
 * = 0). Usadas apenas por testes offline e pela futura composição autorizada.
 */
export function registerProviderWebhookRoutes(app: Hono, deps: ProviderWebhookDependencies): void {
  const limit = bodyLimit({
    maxSize: PROVIDER_WEBHOOK_MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE' }, 413),
  });
  for (const [path, channel] of CHANNEL_PATHS) {
    app.post(`/v1/provider-webhooks/:provider/${path}`, limit, async (c) => {
      const response = await handleProviderWebhook(
        deps,
        {
          provider: c.req.param('provider'),
          headers: lowerCaseHeaders(c.req.raw.headers),
          rawBody: await c.req.text(),
          receivedAt: deps.now(),
        },
        channel,
      );
      return c.json(response.body, response.status);
    });
  }
}
