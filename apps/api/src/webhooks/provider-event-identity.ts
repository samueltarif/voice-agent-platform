import { createHash } from 'node:crypto';
import { providerDeliveryKey, type NormalizedProviderEvent } from '@voice-agent/contracts';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** SHA-256 hex do corpo bruto: evidência auxiliar de integridade, nunca identidade. */
export function hashProviderPayload(rawBody: string): string {
  return sha256(rawBody);
}

/** Hash curto da referência para logs (a referência opaca não é registrada em claro). */
export function redactProviderReference(reference: string): string {
  return sha256(reference).slice(0, 16);
}

/**
 * `event_id` determinístico (formato UUID v8) derivado da chave de entrega:
 * reentregas produzem o MESMO id e a trilha durável as trata como duplicadas.
 */
export function deriveProviderEventId(provider: string, event: NormalizedProviderEvent): string {
  const hex = sha256(`008-OF4|${providerDeliveryKey(provider, event)}`);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
