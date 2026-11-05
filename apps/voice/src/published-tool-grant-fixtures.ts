import type { AgentConfigurationSnapshotV1 } from '@voice-agent/contracts';
import { CallLifecycleGateway, type InitializedCallBinding } from './call-lifecycle-gateway.js';
import { InMemoryCallBootstrapRegistry } from './in-memory-call-bootstrap-registry.js';
import { InMemoryCallSessionStore } from './in-memory-call-session-store.js';
import type { PublishedToolGrant } from './published-tool-grant.js';

/** IDs sintéticos (sem dados reais) para testes offline. */
export const GRANT_FIXTURE_IDS = {
  agentId: '33333333-3333-4333-8333-333333333333',
  agentVersionId: '44444444-4444-4444-8444-444444444444',
} as const;

export interface TestToolGrantInput {
  readonly organizationId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  readonly agentVersionId?: string;
}

/**
 * Emite uma concessão pelo caminho legítimo (prepareCall → consume) de um
 * gateway em memória. Os testes nunca constroem a concessão à mão.
 */
export async function issueTestToolGrantBinding(
  input: TestToolGrantInput,
): Promise<InitializedCallBinding & { readonly toolGrant: PublishedToolGrant }> {
  const gateway = new CallLifecycleGateway({
    bootstrapRegistry: new InMemoryCallBootstrapRegistry(),
    sessionStore: new InMemoryCallSessionStore(),
  });
  const bootstrap = await gateway.prepareCall({
    organizationId: input.organizationId,
    agentId: GRANT_FIXTURE_IDS.agentId,
    agentVersionId: input.agentVersionId ?? GRANT_FIXTURE_IDS.agentVersionId,
    agentSnapshot: input.snapshot,
    agentVersionStatus: 'PUBLISHED',
  });
  const binding = await gateway.consumeBootstrapAndInitializeSession(bootstrap.bootstrapId);
  if (!binding.toolGrant) throw new Error('fixture: legitimate flow must issue a tool grant');
  return binding as InitializedCallBinding & { readonly toolGrant: PublishedToolGrant };
}

export async function issueTestToolGrant(input: TestToolGrantInput): Promise<PublishedToolGrant> {
  return (await issueTestToolGrantBinding(input)).toolGrant;
}
