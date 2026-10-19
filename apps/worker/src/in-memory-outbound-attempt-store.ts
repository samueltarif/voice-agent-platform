import type { OutboundAttempt } from '@voice-agent/contracts';

const IDENTITY_KEYS: readonly (keyof OutboundAttempt)[] = [
  'id',
  'organizationId',
  'jobId',
  'attemptNumber',
  'agentId',
  'agentVersionId',
  'idempotencyKey',
];

function hasMatchingIdentity(a: OutboundAttempt, b: OutboundAttempt): boolean {
  return IDENTITY_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Armazém em memória (somente offline). Toda leitura é escopada por
 * `organizationId`: um tenant nunca enxerga tentativas de outro.
 * Separação explícita entre inserção de nova tentativa (insertIfAbsent)
 * e atualização de estado (update), preservando identidade imutável.
 * A persistência durável e a recuperação após reinício real pertencem à 008-OF2.
 */
export class InMemoryOutboundAttemptStore {
  private readonly attempts = new Map<string, OutboundAttempt>();

  private key(organizationId: string, attemptId: string): string {
    return `${organizationId}:${attemptId}`;
  }

  insertIfAbsent(attempt: OutboundAttempt): boolean {
    const k = this.key(attempt.organizationId, attempt.id);
    if (this.attempts.has(k)) return false;
    this.attempts.set(k, attempt);
    return true;
  }

  update(attempt: OutboundAttempt): boolean {
    const k = this.key(attempt.organizationId, attempt.id);
    const existing = this.attempts.get(k);
    if (!existing) return false;
    if (!hasMatchingIdentity(existing, attempt)) {
      throw new Error('Attempt identity fields are immutable.');
    }
    this.attempts.set(k, attempt);
    return true;
  }

  get(organizationId: string, attemptId: string): OutboundAttempt | null {
    return this.attempts.get(this.key(organizationId, attemptId)) ?? null;
  }

  listByJob(organizationId: string, jobId: string): OutboundAttempt[] {
    return [...this.attempts.values()].filter(
      (a) => a.organizationId === organizationId && a.jobId === jobId,
    );
  }

  listByOrganization(organizationId: string): OutboundAttempt[] {
    return [...this.attempts.values()].filter((a) => a.organizationId === organizationId);
  }
}
