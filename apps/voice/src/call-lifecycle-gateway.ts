import { randomUUID } from 'node:crypto';
import type {
  AgentConfigurationSnapshotV1,
  AgentVersionStatus,
  CallBootstrap,
  CallBootstrapRegistryPort,
  CallSession,
  CallSessionStorePort,
} from '@voice-agent/contracts';
import { InvalidAgentVersionStatusError } from '@voice-agent/errors';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { createCallSession } from './create-call-session.js';

export interface PrepareCallInput {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly agentSnapshot: AgentConfigurationSnapshotV1;
  readonly agentVersionStatus: AgentVersionStatus;
  readonly providerName?: string | undefined;
  readonly providerCallId?: string | undefined;
  readonly ttlMs?: number | undefined;
}

export interface CallLifecycleGatewayDependencies {
  readonly bootstrapRegistry: CallBootstrapRegistryPort;
  readonly sessionStore: CallSessionStorePort;
  readonly defaultTtlMs?: number | undefined;
  readonly logger?: Logger | undefined;
}

export interface InitializedCallBinding {
  readonly session: CallSession;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly bootstrapId: string;
}

const DEFAULT_TTL_MS = 60_000;

export class CallLifecycleGateway {
  private readonly bootstrapRegistry: CallBootstrapRegistryPort;
  private readonly sessionStore: CallSessionStorePort;
  private readonly defaultTtlMs: number;
  private readonly logger: Logger;

  constructor(deps: CallLifecycleGatewayDependencies) {
    this.bootstrapRegistry = deps.bootstrapRegistry;
    this.sessionStore = deps.sessionStore;
    this.defaultTtlMs = deps.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.logger = deps.logger ?? createNullLogger();
  }

  async prepareCall(input: PrepareCallInput): Promise<CallBootstrap> {
    if (input.agentVersionStatus !== 'PUBLISHED') {
      throw new InvalidAgentVersionStatusError(
        `Cannot prepare call for agent version with status '${input.agentVersionStatus}'. Only PUBLISHED versions allowed.`,
      );
    }

    const now = new Date();
    const ttlMs = input.ttlMs ?? this.defaultTtlMs;
    const expiresAt = new Date(now.getTime() + ttlMs);
    const callId = randomUUID();
    const bootstrapId = randomUUID();

    const bootstrap: CallBootstrap = {
      bootstrapId,
      callId,
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      agentSnapshot: input.agentSnapshot,
      status: 'PENDING',
      createdAt: now,
      expiresAt,
      ...(input.providerCallId !== undefined ? { providerCallId: input.providerCallId } : {}),
    };

    await this.bootstrapRegistry.register(bootstrap);

    this.logger.info('call.bootstrap.created', {
      callId,
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      ...(input.providerName !== undefined ? { provider: input.providerName } : {}),
      ...(input.providerCallId !== undefined ? { providerCallId: input.providerCallId } : {}),
    });

    return bootstrap;
  }

  async consumeBootstrapAndInitializeSession(
    bootstrapId: string,
    now = new Date(),
  ): Promise<InitializedCallBinding> {
    const consumed = await this.bootstrapRegistry.consume(bootstrapId, now);

    const session = createCallSession({
      callId: consumed.callId,
      organizationId: consumed.organizationId,
      agentId: consumed.agentId,
      agentVersionId: consumed.agentVersionId,
      agentVersionStatus: 'PUBLISHED',
    });

    await this.sessionStore.save(session);

    this.logger.info('call.bootstrap.consumed', {
      callId: session.callId,
      organizationId: session.organizationId,
      agentId: session.agentId,
      agentVersionId: session.agentVersionId,
    });

    return {
      session,
      snapshot: consumed.agentSnapshot,
      bootstrapId,
    };
  }

  async getBootstrap(bootstrapId: string): Promise<CallBootstrap | null> {
    return this.bootstrapRegistry.getById(bootstrapId);
  }
}
