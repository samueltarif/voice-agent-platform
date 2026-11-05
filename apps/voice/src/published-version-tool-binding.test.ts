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

function engineFor(snapshot: AgentConfigurationSnapshotV1) {
  const registry = new InMemoryToolRegistry();
  registry.registerTool(createOperatingHoursToolDefinition());
  return new ToolExecutionEngine({
    registry,
    isToolAllowed: createPublishedVersionToolAuthorizer(snapshot),
  });
}

function contextFor(org: string, version: string, snapshot: AgentConfigurationSnapshotV1) {
  return buildPublishedVersionToolExecutionContext({
    organizationId: org,
    agentId: `agent-${org}`,
    agentVersionId: version,
    snapshot,
  });
}

describe('published version authorizer — D8b binding (no fallback snapshot)', () => {
  it('authorizes the published snapshot bound to it and keeps operating hours working', async () => {
    const snapshot = publishedSnapshot('Seg a Sex, 9h-18h');
    const result = await engineFor(snapshot).executeTool(
      invocation,
      contextFor(ORG_A, 'v1', snapshot),
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('rejects a context without snapshot instead of falling back to the construction snapshot', async () => {
    const snapshot = publishedSnapshot('Seg a Sex, 9h-18h');
    const authorize = createPublishedVersionToolAuthorizer(snapshot);
    const bare: ToolExecutionContext = { organizationId: ORG_A, agentVersionId: 'v1' };
    expect(authorize(OPERATING_HOURS_TOOL_NAME, bare)).toBe(false);
    expect(await engineFor(snapshot).executeTool(invocation, bare)).toMatchObject({
      status: 'REJECTED',
      reason: 'UNAUTHORIZED_TOOL',
    });
  });

  it('rejects the snapshot of another version, even with identical content', () => {
    const v1 = publishedSnapshot('Seg a Sex, 9h-18h');
    const v2 = structuredClone(v1);
    const authorize = createPublishedVersionToolAuthorizer(v1);
    expect(authorize(OPERATING_HOURS_TOOL_NAME, contextFor(ORG_A, 'v2', v2))).toBe(false);
    expect(authorize(OPERATING_HOURS_TOOL_NAME, contextFor(ORG_A, 'v1', v1))).toBe(true);
  });

  it('rejects the snapshot of another organization', () => {
    const snapshotA = publishedSnapshot('A: 8h-12h');
    const snapshotB = publishedSnapshot('B: 14h-18h');
    const authorizeA = createPublishedVersionToolAuthorizer(snapshotA);
    expect(authorizeA(OPERATING_HOURS_TOOL_NAME, contextFor(ORG_B, 'vB', snapshotB))).toBe(false);
  });

  it('isolates organizations under concurrent execution', async () => {
    const snapshots = {
      [ORG_A]: publishedSnapshot('A: 8h-12h'),
      [ORG_B]: publishedSnapshot('B: 14h-18h'),
    };
    const engines = {
      [ORG_A]: engineFor(snapshots[ORG_A]!),
      [ORG_B]: engineFor(snapshots[ORG_B]!),
    };
    const spy = vi.fn();
    const runs = Array.from({ length: 40 }, (_v, i) => {
      const org = i % 2 === 0 ? ORG_A : ORG_B;
      const other = org === ORG_A ? ORG_B : ORG_A;
      const own = engines[org]!.executeTool(
        invocation,
        contextFor(org, `v-${org}`, snapshots[org]!),
      );
      const crossed = engines[org]!.executeTool(
        invocation,
        contextFor(other, `v-${other}`, snapshots[other]!),
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
