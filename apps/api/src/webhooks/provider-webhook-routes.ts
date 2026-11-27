import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { handleProviderWebhook, type ProviderWebhookChannel } from './provider-webhook-pipeline.js';
import type { ProviderWebhookDependencies } from './provider-webhook-ports.js';

/** Teto do corpo bruto; entregas maiores são recusadas antes de qualquer parsing. */
export const PROVIDER_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;

/** DEC-077: relatório pós-chamada com histórico inteiro (E2-V: dezenas de KB). */
export const PROVIDER_SESSION_REPORT_MAX_BODY_BYTES = 512 * 1024;

const CHANNEL_PATHS: ReadonlyArray<readonly [string, ProviderWebhookChannel, number]> = [
  ['events', 'CALL_STATUS', PROVIDER_WEBHOOK_MAX_BODY_BYTES],
  ['tools', 'TOOL_INVOCATION', PROVIDER_WEBHOOK_MAX_BODY_BYTES],
  ['session-reports', 'SESSION_REPORT', PROVIDER_SESSION_REPORT_MAX_BODY_BYTES],
];

function lowerCaseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/** Só parâmetros com valor único: repetição torna a credencial ambígua (omitida). */
function singleValuedQuery(queries: Record<string, string[]>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(queries)) {
    if (values.length === 1) result[key] = values[0]!;
  }
  return result;
}

/**
 * 008-OF4 — rotas de ingress de provedores. NÃO são montadas em `createApp`:
 * expor endpoint público exige autorização humana explícita (webhooks públicos
 * = 0). Usadas apenas por testes offline e pela futura composição autorizada.
 */
export function registerProviderWebhookRoutes(app: Hono, deps: ProviderWebhookDependencies): void {
  for (const [path, channel, maxSize] of CHANNEL_PATHS) {
    const limit = bodyLimit({
      maxSize,
      onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE' }, 413),
    });
    app.post(`/v1/provider-webhooks/:provider/${path}`, limit, async (c) => {
      const response = await handleProviderWebhook(
        deps,
        {
          provider: c.req.param('provider'),
          headers: lowerCaseHeaders(c.req.raw.headers),
          rawBody: await c.req.text(),
          query: singleValuedQuery(c.req.queries()),
          receivedAt: deps.now(),
        },
        channel,
      );
      return c.json(response.body, response.status);
    });
  }
}
