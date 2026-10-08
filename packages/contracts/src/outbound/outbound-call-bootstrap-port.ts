export interface OutboundCallBootstrapRequest {
  readonly organizationId: string;
  readonly outboundJobId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly destinationPhone: string;
  readonly idempotencyKey: string;
  readonly callContext?: Readonly<Record<string, string>> | undefined;
}

export type OutboundCallBootstrapOutcome =
  | {
      readonly kind: 'ACCEPTED';
      readonly callId: string;
      readonly providerCallId?: string | undefined;
    }
  | {
      readonly kind: 'RETRYABLE_FAILURE';
      readonly reason: string;
    }
  | {
      readonly kind: 'TERMINAL_FAILURE';
      readonly reason: string;
    };

export interface OutboundCallBootstrapPort {
  readonly providerName: string;
  bootstrapOutboundCall(
    request: OutboundCallBootstrapRequest,
  ): Promise<OutboundCallBootstrapOutcome>;
}
