import type {
  AgentConfigurationSnapshotV1,
  AgentVersionStatus,
  OutboundCallBootstrapOutcome,
  OutboundCallBootstrapPort,
  OutboundCallBootstrapRequest,
} from '@voice-agent/contracts';
import type { CallLifecycleGateway } from './call-lifecycle-gateway.js';

export type AgentSnapshotResolver = (
  organizationId: string,
  agentId: string,
  agentVersionId: string,
) => Promise<{ snapshot: AgentConfigurationSnapshotV1; status: AgentVersionStatus } | null>;

export interface OutboundCallLifecycleBootstrapAdapterDependencies {
  readonly gateway: CallLifecycleGateway;
  readonly snapshotResolver: AgentSnapshotResolver;
}

export class OutboundCallLifecycleBootstrapAdapter implements OutboundCallBootstrapPort {
  readonly providerName = 'voice-lifecycle-gateway';

  constructor(private readonly deps: OutboundCallLifecycleBootstrapAdapterDependencies) {}

  async bootstrapOutboundCall(
    request: OutboundCallBootstrapRequest,
  ): Promise<OutboundCallBootstrapOutcome> {
    const resolved = await this.deps.snapshotResolver(
      request.organizationId,
      request.agentId,
      request.agentVersionId,
    );

    if (!resolved) {
      return {
        kind: 'TERMINAL_FAILURE',
        reason: `Agent version '${request.agentVersionId}' not found for tenant '${request.organizationId}'`,
      };
    }

    if (resolved.status !== 'PUBLISHED') {
      return {
        kind: 'TERMINAL_FAILURE',
        reason: `Agent version status is '${resolved.status}'. Only PUBLISHED versions are allowed.`,
      };
    }

    try {
      const bootstrap = await this.deps.gateway.prepareCall({
        organizationId: request.organizationId,
        agentId: request.agentId,
        agentVersionId: request.agentVersionId,
        agentSnapshot: resolved.snapshot,
        agentVersionStatus: resolved.status,
        providerName: 'provider-neutral-offline',
        providerCallId: request.outboundJobId,
      });

      return {
        kind: 'ACCEPTED',
        callId: bootstrap.callId,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        kind: 'RETRYABLE_FAILURE',
        reason,
      };
    }
  }
}
