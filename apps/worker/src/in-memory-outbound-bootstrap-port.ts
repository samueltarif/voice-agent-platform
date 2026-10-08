import type {
  OutboundCallBootstrapOutcome,
  OutboundCallBootstrapPort,
  OutboundCallBootstrapRequest,
} from '@voice-agent/contracts';

export class InMemoryOutboundBootstrapPort implements OutboundCallBootstrapPort {
  readonly providerName = 'in-memory-test-port';
  public invocations: OutboundCallBootstrapRequest[] = [];
  private queuedOutcomes: OutboundCallBootstrapOutcome[] = [];
  private defaultOutcome: OutboundCallBootstrapOutcome = {
    kind: 'ACCEPTED',
    callId: 'fake-call-123',
  };

  setDefaultOutcome(outcome: OutboundCallBootstrapOutcome): void {
    this.defaultOutcome = outcome;
  }

  queueOutcome(outcome: OutboundCallBootstrapOutcome): void {
    this.queuedOutcomes.push(outcome);
  }

  async bootstrapOutboundCall(
    request: OutboundCallBootstrapRequest,
  ): Promise<OutboundCallBootstrapOutcome> {
    this.invocations.push(request);
    const next = this.queuedOutcomes.shift();
    return next ?? this.defaultOutcome;
  }

  reset(): void {
    this.invocations = [];
    this.queuedOutcomes = [];
    this.defaultOutcome = { kind: 'ACCEPTED', callId: 'fake-call-123' };
  }
}
