import type {
  AiAgentLegResultEvent,
  CallLeg,
  SecondReferenceAssessment,
} from '@voice-agent/contracts';

/**
 * 008-OF5 (S4) — Estado OFFLINE da orquestração que hoje NÃO tem tabela:
 * sessão conversacional preparada, hash do token de callback, pernas,
 * anomalias e desfecho de orçamento. A versão durável exige migration
 * (não autorizada nesta etapa); este store só existe para testes offline.
 */
export type PreparedSessionState = 'PREPARED' | 'TERMINATED' | 'TERMINATION_UNCONFIRMED';
export type BudgetDisposition = 'RELEASE' | 'PENDING_RECONCILIATION';

export interface PreparedSessionRecord {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly sessionRef: string;
  readonly sipUri: string;
  readonly expiresAt: string | null;
  readonly preparedAt: string;
  readonly callbackTokenHash: string;
  sessionState: PreparedSessionState;
}

export interface AttemptAnomaly {
  readonly organizationId: string;
  readonly attemptId: string;
  readonly kind: 'SECOND_CONTACT_REFERENCE' | 'DIVERGENT_REFERENCE' | 'ORPHAN_SESSION_RISK';
  readonly assessment?: SecondReferenceAssessment | undefined;
}

function key(organizationId: string, attemptId: string): string {
  return `${organizationId}:${attemptId}`;
}

export class InMemorySessionAttemptStore {
  private readonly sessions = new Map<string, PreparedSessionRecord>();
  private readonly tokenIndex = new Map<string, string>();
  private readonly legs = new Map<string, CallLeg[]>();
  private readonly results = new Map<string, AiAgentLegResultEvent[]>();
  private readonly budget = new Map<string, BudgetDisposition>();
  readonly anomalies: AttemptAnomaly[] = [];

  /** Write-ahead: grava a sessão ANTES de qualquer efeito externo de discagem. */
  savePreparation(record: PreparedSessionRecord): boolean {
    const id = key(record.organizationId, record.attemptId);
    if (this.sessions.has(id) || this.tokenIndex.has(record.callbackTokenHash)) return false;
    this.sessions.set(id, record);
    this.tokenIndex.set(record.callbackTokenHash, id);
    return true;
  }

  getPreparation(organizationId: string, attemptId: string): PreparedSessionRecord | null {
    return this.sessions.get(key(organizationId, attemptId)) ?? null;
  }

  findByTokenHash(tokenHash: string): PreparedSessionRecord | null {
    const id = this.tokenIndex.get(tokenHash);
    return id ? (this.sessions.get(id) ?? null) : null;
  }

  listPreparations(organizationId: string): PreparedSessionRecord[] {
    return [...this.sessions.values()].filter((r) => r.organizationId === organizationId);
  }

  getLegs(organizationId: string, attemptId: string): readonly CallLeg[] {
    return this.legs.get(key(organizationId, attemptId)) ?? [];
  }

  saveLeg(leg: CallLeg): void {
    const id = key(leg.organizationId, leg.attemptId);
    const others = (this.legs.get(id) ?? []).filter(
      (existing) => existing.providerLegReference !== leg.providerLegReference,
    );
    this.legs.set(id, [...others, leg]);
  }

  saveLegResult(event: AiAgentLegResultEvent): void {
    const id = key(event.organizationId, event.attemptId);
    this.results.set(id, [...(this.results.get(id) ?? []), event]);
  }

  getLegResults(organizationId: string, attemptId: string): readonly AiAgentLegResultEvent[] {
    return this.results.get(key(organizationId, attemptId)) ?? [];
  }

  setBudgetDisposition(organizationId: string, attemptId: string, value: BudgetDisposition): void {
    const id = key(organizationId, attemptId);
    if (this.budget.get(id) === 'PENDING_RECONCILIATION') return;
    this.budget.set(id, value);
  }

  getBudgetDisposition(organizationId: string, attemptId: string): BudgetDisposition | null {
    return this.budget.get(key(organizationId, attemptId)) ?? null;
  }
}
