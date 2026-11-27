import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  ProviderWebhookAuthenticator,
  WebhookAuthOutcome,
  WebhookAuthRejectionReason,
} from '@voice-agent/contracts';

/**
 * E2-V / DEC-077 — autenticação do relatório pós-chamada pelo ÚNICO mecanismo
 * observado: token secreto no parâmetro da URL configurada em
 * `session_data_webhook` (`?t=…`, exp. 5). Cabeçalho de autenticação do
 * relatório NÃO foi comprovado e assinatura NÃO é presumida; por isso aqui
 * cabeçalhos são ignorados.
 *
 * Limites (riscos residuais registrados): token em URL pode aparecer em logs de
 * proxies/servidores intermediários; não há janela anti-replay (repetição é
 * absorvida pela idempotência por digest da reconciliação). Segredo ausente ou
 * curto ⇒ fail-closed (`NOT_CONFIGURED`). Comparação em tempo constante.
 */

export const MILLIS_REPORT_TOKEN_PARAMETER = 't';
export const MILLIS_REPORT_TOKEN_MIN_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
const rejected = (reason: WebhookAuthRejectionReason): WebhookAuthOutcome => ({
  kind: 'REJECTED',
  reason,
});

export function createMillisReportQueryTokenAuthenticator(options: {
  readonly secret: string | undefined;
}): ProviderWebhookAuthenticator {
  const secret = options.secret;
  const expected =
    secret && secret.length >= MILLIS_REPORT_TOKEN_MIN_LENGTH ? digest(secret) : null;
  return {
    authenticate: async (request) => {
      if (!expected) return rejected('NOT_CONFIGURED');
      const token = request.query?.[MILLIS_REPORT_TOKEN_PARAMETER];
      if (!token) return rejected('MISSING_CREDENTIALS');
      return timingSafeEqual(digest(token), expected)
        ? { kind: 'AUTHENTICATED' }
        : rejected('INVALID_CREDENTIALS');
    },
  };
}
