import { describe, expect, it, vi } from 'vitest';
import type { AgentConfigurationSnapshotV1, ToolExecutionContext } from '@voice-agent/contracts';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
} from './published-version-toolset.js';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import {
  createOperatingHoursToolDefinition,
  OPERATING_HOURS_TOOL_NAME,
} from './operating-hours-tool.js';
import type { PublishedToolGrant } from './published-tool-grant.js';
import { issueTestToolGrant } from './published-tool-grant-fixtures.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function publishedSnapshot(hours: string): AgentConfigurationSnapshotV1 {
  return {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa Exemplo',
      objective: 'Atender',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Pode repetir?',
    },
    voice: { languageCode: 'pt-BR' },
    rules: { conversational: ['Seja cordial'], deterministic: { operatingHours: hours } },
    tools: ['agent.operating_hours'],
  };
}

const invocation = {
  toolName: OPERATING_HOURS_TOOL_NAME,
  rawArguments: { query: 'Qual é o horário de atendimento de vocês?' },
};

function engineFor(grant: PublishedToolGrant) {
  const registry = new InMemoryToolRegistry();
  registry.registerTool(createOperatingHoursToolDefinition());
  return new ToolExecutionEngine({
    registry,
    isToolAllowed: createPublishedVersionToolAuthorizer(grant),
  });
}

const grantFor = (org: string, snapshot: AgentConfigurationSnapshotV1, agentVersionId?: string) =>
  issueTestToolGrant({
    organizationId: org,
    snapshot,
    ...(agentVersionId ? { agentVersionId } : {}),
  });

const VERSION_2 = '66666666-6666-4666-8666-666666666666';

/**
 * TEST_CHANGE_REASON = D8B_GRANT_BINDING (DEC-048): verificador e contexto
 * construídos a partir de concessões emitidas pelo gateway. Os 5 cenários e
 * suas expectativas foram mantidos (ASSERTION_EQUIVALENT); o de outra versão
 * passa a usar versões com IDs distintos além de objetos distintos
 * (ASSERTION_STRONGER).
 */
describe('published version authorizer — D8b binding (no fallback snapshot)', () => {
  it('authorizes the published snapshot bound to it and keeps operating hours working', async () => {
    const grant = await grantFor(ORG_A, publishedSnapshot('Seg a Sex, 9h-18h'));
    const result = await engineFor(grant).executeTool(
      invocation,
      buildPublishedVersionToolExecutionContext(grant),
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('rejects a context without snapshot instead of falling back to the construction snapshot', async () => {
    const grant = await grantFor(ORG_A, publishedSnapshot('Seg a Sex, 9h-18h'));
    const authorize = createPublishedVersionToolAuthorizer(grant);
    const { snapshot: _omitted, ...bare } = buildPublishedVersionToolExecutionContext(grant);
    expect(authorize(OPERATING_HOURS_TOOL_NAME, bare as ToolExecutionContext)).toBe(false);
    expect(await engineFor(grant).executeTool(invocation, bare)).toMatchObject({
      status: 'REJECTED',
      reason: 'UNAUTHORIZED_TOOL',
    });
  });

  it('rejects the snapshot of another version, even with identical content', async () => {
    const v1 = publishedSnapshot('Seg a Sex, 9h-18h');
    const grant1 = await grantFor(ORG_A, v1);
    const grant2 = await grantFor(ORG_A, structuredClone(v1), VERSION_2);
    const authorize = createPublishedVersionToolAuthorizer(grant1);
    const ctx2 = buildPublishedVersionToolExecutionContext(grant2);
    expect(authorize(OPERATING_HOURS_TOOL_NAME, ctx2)).toBe(false);
    const ctx1 = buildPublishedVersionToolExecutionContext(grant1);
    expect(authorize(OPERATING_HOURS_TOOL_NAME, ctx1)).toBe(true);
  });

  it('rejects the snapshot of another organization', async () => {
    const grantA = await grantFor(ORG_A, publishedSnapshot('A: 8h-12h'));
    const grantB = await grantFor(ORG_B, publishedSnapshot('B: 14h-18h'));
    const authorizeA = createPublishedVersionToolAuthorizer(grantA);
    const ctxB = buildPublishedVersionToolExecutionContext(grantB);
    expect(authorizeA(OPERATING_HOURS_TOOL_NAME, ctxB)).toBe(false);
  });

  it('isolates organizations under concurrent execution', async () => {
    const snapshots = {
      [ORG_A]: publishedSnapshot('A: 8h-12h'),
      [ORG_B]: publishedSnapshot('B: 14h-18h'),
    };
    const grants = {
      [ORG_A]: await grantFor(ORG_A, snapshots[ORG_A]!),
      [ORG_B]: await grantFor(ORG_B, snapshots[ORG_B]!),
    };
    const engines = { [ORG_A]: engineFor(grants[ORG_A]!), [ORG_B]: engineFor(grants[ORG_B]!) };
    const spy = vi.fn();
    const runs = Array.from({ length: 40 }, (_v, i) => {
      const org = i % 2 === 0 ? ORG_A : ORG_B;
      const other = org === ORG_A ? ORG_B : ORG_A;
      const own = engines[org]!.executeTool(
        invocation,
        buildPublishedVersionToolExecutionContext(grants[org]!),
      );
      const crossed = engines[org]!.executeTool(
        invocation,
        buildPublishedVersionToolExecutionContext(grants[other]!),
      );
      return Promise.all([own, crossed]).then(([ok, denied]) => spy(org, ok, denied));
    });
    await Promise.all(runs);
    for (const [org, ok, denied] of spy.mock.calls) {
      expect(ok).toMatchObject({ status: 'SUCCESS' });
      expect(JSON.stringify(ok)).toContain(org === ORG_A ? 'A: 8h-12h' : 'B: 14h-18h');
      expect(denied).toMatchObject({ status: 'REJECTED', reason: 'UNAUTHORIZED_TOOL' });
    }
    expect(spy).toHaveBeenCalledTimes(40);
  });
});
