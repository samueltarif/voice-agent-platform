import { createHash } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { OutboundAttemptEvent } from '@voice-agent/contracts';
import { callEvents } from '../schema/call-events.js';
import type { DatabaseExecutor } from './database-executor.js';

export type StoredEventResult = 'APPLIED' | 'STALE' | 'REJECTED';

export interface StoredEventIdentity {
  readonly organizationId: string;
  readonly attemptId: string | null;
  readonly callSessionId: string | null;
  readonly fingerprint: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
}

/**
 * Impressão digital determinística do evento INTERNO já validado (chaves
 * ordenadas). Detecta replay do mesmo id com conteúdo divergente. Não é
 * autenticação nem canonicalização de webhooks de provedores.
 */
export function fingerprintAttemptEvent(event: OutboundAttemptEvent): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(event)))
    .digest('hex');
}

const ATTRIBUTE_KEYS = ['authorityId', 'providerReference', 'reasonCode'] as const;

/** Somente atributos operacionais whitelisted são persistidos (sem payload bruto). */
export function extractEventAttributes(event: OutboundAttemptEvent): Record<string, string> {
  const source = event as Readonly<Record<string, unknown>>;
  const entries = ATTRIBUTE_KEYS.flatMap((key) => {
    const value = source[key];
    return typeof value === 'string' ? [[key, value] as const] : [];
  });
  return Object.fromEntries(entries);
}

export async function findEventIdentity(
  executor: DatabaseExecutor,
  eventId: string,
): Promise<StoredEventIdentity | null> {
  const [row] = await executor
    .select({
      organizationId: callEvents.organizationId,
      attemptId: callEvents.attemptId,
      callSessionId: callEvents.callSessionId,
      fingerprint: callEvents.fingerprint,
    })
    .from(callEvents)
    .where(eq(callEvents.eventId, eventId))
    .limit(1);
  return row ?? null;
}

export async function listAppliedAttemptEventIds(
  executor: DatabaseExecutor,
  scope: { readonly organizationId: string; readonly attemptId: string },
): Promise<string[]> {
  const rows = await executor
    .select({ eventId: callEvents.eventId })
    .from(callEvents)
    .where(
      and(
        eq(callEvents.organizationId, scope.organizationId),
        eq(callEvents.attemptId, scope.attemptId),
        eq(callEvents.applicationResult, 'APPLIED'),
      ),
    )
    .orderBy(asc(callEvents.sequence));
  return rows.map((row) => row.eventId);
}

export interface InsertAttemptEventInput {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly callSessionId: string | null;
  readonly event: OutboundAttemptEvent;
  readonly result: StoredEventResult;
  readonly rejectionReason: string | null;
  readonly now: Date;
  readonly origin?: ProviderEventOrigin | undefined;
}

/** Proveniência de evento externo; nenhum payload bruto é armazenado. */
export interface ProviderEventOrigin {
  readonly provider: string;
  readonly providerEventId: string | null;
  readonly providerCallId: string;
  /** SHA-256 hex do corpo bruto: evidência auxiliar, nunca identidade. */
  readonly payloadHash: string;
}

function provenanceColumns(origin: ProviderEventOrigin | undefined) {
  if (!origin) return { source: 'INTERNAL' as const };
  return {
    source: 'PROVIDER' as const,
    provider: origin.provider,
    providerEventId: origin.providerEventId,
    providerCallId: origin.providerCallId,
    payloadHash: origin.payloadHash,
  };
}

export async function insertAttemptEvent(
  executor: DatabaseExecutor,
  input: InsertAttemptEventInput,
): Promise<void> {
  await executor.insert(callEvents).values({
    eventId: input.event.eventId,
    organizationId: input.organizationId,
    attemptId: input.attemptId,
    callSessionId: input.callSessionId,
    ...provenanceColumns(input.origin),
    eventType: input.event.type,
    attributes: extractEventAttributes(input.event),
    fingerprint: fingerprintAttemptEvent(input.event),
    occurredAt: new Date(input.event.occurredAt),
    receivedAt: input.now,
    processedAt: input.now,
    applicationResult: input.result,
    rejectionReason: input.rejectionReason,
  });
}
