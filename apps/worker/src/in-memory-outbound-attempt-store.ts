import type { OutboundAttempt } from '@voice-agent/contracts';

/**
 * Armazém em memória (somente offline). Toda leitura é escopada por
 * `organizationId`: um tenant nunca enxerga tentativas de outro. A
 * persistência durável e a recuperação após reinício real pertencem à 008-OF2.
 */
export class InMemoryOutboundAttemptStore {
  private readonly attempts = new Map<string, OutboundAttempt>();

  private key(organizationId: string, attemptId: string): string {
    return `${organizationId}:${attemptId}`;
  }

  save(attempt: OutboundAttempt): void {
    this.attempts.set(this.key(attempt.organizationId, attempt.id), attempt);
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
