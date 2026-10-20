import type {
  TelephonyOriginationPort,
  TelephonyOriginationRequest,
  TelephonyOriginationResult,
  TelephonyReconciliationPort,
  TelephonyReconciliationRequest,
  TelephonyReconciliationResult,
} from '@voice-agent/contracts';

/** Passo roteirizado: um resultado neutro, falha simulada ou controle assíncrono (deferred). */
export type FakeOriginationStep =
  | TelephonyOriginationResult
  | { readonly kind: 'THROW' }
  | { readonly kind: 'DEFERRED'; readonly promise: Promise<TelephonyOriginationResult> };

export type FakeReconciliationStep =
  | TelephonyReconciliationResult
  | { readonly kind: 'THROW' }
  | { readonly kind: 'DEFERRED'; readonly promise: Promise<TelephonyReconciliationResult> };

/**
 * Fake determinístico e 100% offline: sem sockets, HTTP ou SDK. Registra cada
 * invocação para que testes provem quantas vezes uma "discagem" foi emitida.
 */
export class InMemoryTelephonyOriginationPort
  implements TelephonyOriginationPort, TelephonyReconciliationPort
{
  readonly providerName = 'in-memory-telephony-fake';
  readonly originations: TelephonyOriginationRequest[] = [];
  readonly reconciliations: TelephonyReconciliationRequest[] = [];
  private readonly originationSteps: FakeOriginationStep[] = [];
  private readonly reconciliationSteps: FakeReconciliationStep[] = [];

  queueOrigination(step: FakeOriginationStep): void {
    this.originationSteps.push(step);
  }

  queueReconciliation(step: FakeReconciliationStep): void {
    this.reconciliationSteps.push(step);
  }

  async originate(request: TelephonyOriginationRequest): Promise<TelephonyOriginationResult> {
    this.originations.push(request);
    const step = this.originationSteps.shift() ?? {
      kind: 'ACCEPTED',
      providerReference: 'fake-ref',
    };
    if (step.kind === 'THROW') throw new Error('simulated transport failure');
    if (step.kind === 'DEFERRED') return await step.promise;
    return step;
  }

  async reconcile(request: TelephonyReconciliationRequest): Promise<TelephonyReconciliationResult> {
    this.reconciliations.push(request);
    const step = this.reconciliationSteps.shift() ?? { kind: 'INCONCLUSIVE' };
    if (step.kind === 'THROW') throw new Error('simulated reconciliation failure');
    if (step.kind === 'DEFERRED') return await step.promise;
    return step;
  }
}
