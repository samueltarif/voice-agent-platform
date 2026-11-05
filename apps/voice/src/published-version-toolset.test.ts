import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  ToolDefinition,
  ToolExecutionContext,
  ToolInvocation,
} from '@voice-agent/contracts';
import {
  buildPublishedVersionToolExecutionContext,
  createPublishedVersionToolAuthorizer,
  isToolConfiguredInSnapshot,
  resolvePublishedVersionToolset,
} from './published-version-toolset.js';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import { createOperatingHoursToolDefinition } from './operating-hours-tool.js';
import {
  GRANT_FIXTURE_IDS,
  issueTestToolGrant,
  issueTestToolGrantBinding,
} from './published-tool-grant-fixtures.js';

const TEST_ORG = '55555555-5555-4555-8555-555555555555';

describe('Published Version Toolset Runtime Context', () => {
  const sampleSnapshotWithTools: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente',
      companyName: 'Empresa',
      objective: 'Atender clientes',
      tone: 'FORMAL',
      greetingPhrase: 'Olá',
      closingPhrase: 'Tchau',
      fallbackPhrase: 'Não entendi',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja cordial'],
      deterministic: {
        operatingHours: 'Segunda a Sexta, das 09h às 18h',
      },
    },
    tools: ['agent.operating_hours'],
  };

  const sampleSnapshotWithoutTools: AgentConfigurationSnapshotV1 = {
    ...sampleSnapshotWithTools,
    tools: [],
  };

  it('resolves toolset from snapshot correctly', () => {
    expect(resolvePublishedVersionToolset(undefined)).toEqual([]);
    expect(resolvePublishedVersionToolset(sampleSnapshotWithoutTools)).toEqual([]);
    expect(resolvePublishedVersionToolset(sampleSnapshotWithTools)).toEqual([
      'agent.operating_hours',
    ]);
  });

  it('checks tool configuration membership in snapshot', () => {
    expect(isToolConfiguredInSnapshot('agent.operating_hours', sampleSnapshotWithTools)).toBe(true);
    expect(isToolConfiguredInSnapshot('agent.operating_hours', sampleSnapshotWithoutTools)).toBe(
      false,
    );
    expect(isToolConfiguredInSnapshot('unregistered_tool', sampleSnapshotWithTools)).toBe(false);
  });

  // TEST_CHANGE_REASON = D8B_GRANT_BINDING (DEC-048), ASSERTION_STRONGER: os IDs
  // e o snapshot do contexto passam a vir só da concessão emitida pelo gateway.
  it('builds published version ToolExecutionContext with trusted snapshot authority', async () => {
    const binding = await issueTestToolGrantBinding({
      organizationId: TEST_ORG,
      snapshot: sampleSnapshotWithTools,
    });
    const context = buildPublishedVersionToolExecutionContext(binding.toolGrant, {
      turnId: 'turn-1',
    });

    expect(context.organizationId).toBe(TEST_ORG);
    expect(context.agentId).toBe(GRANT_FIXTURE_IDS.agentId);
    expect(context.agentVersionId).toBe(GRANT_FIXTURE_IDS.agentVersionId);
    expect(context.snapshot).toBe(sampleSnapshotWithTools);
    expect(context.callId).toBe(binding.session.callId);
    expect(context.turnId).toBe('turn-1');
  });

  it('authorizes execution when tool is in published snapshot toolset', async () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(createOperatingHoursToolDefinition());

    // TEST_CHANGE_REASON = D8B_GRANT_BINDING (DEC-048), ASSERTION_EQUIVALENT.
    const grant = await issueTestToolGrant({
      organizationId: TEST_ORG,
      snapshot: sampleSnapshotWithTools,
    });
    const isToolAllowed = createPublishedVersionToolAuthorizer(grant);
    const engine = new ToolExecutionEngine({ registry, isToolAllowed });

    const context: ToolExecutionContext = buildPublishedVersionToolExecutionContext(grant);

    const invocation: ToolInvocation = {
      toolName: 'agent.operating_hours',
      rawArguments: {
        query: 'Qual é o horário de atendimento?',
      },
    };

    const result = await engine.executeTool(invocation, context);
    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect((result.output as { handled: boolean }).handled).toBe(true);
    }
  });

  it('rejects execution as UNAUTHORIZED_TOOL when tool is not in published toolset', async () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(createOperatingHoursToolDefinition());

    // Extra tool registered in registry but NOT configured in snapshot
    const extraTool: ToolDefinition = {
      name: 'crm.lookup',
      validateInput: () => ({ success: true, data: {} }),
      execute: async () => ({ customer: 'found' }),
    };
    registry.registerTool(extraTool);

    // TEST_CHANGE_REASON = D8B_GRANT_BINDING (DEC-048), ASSERTION_EQUIVALENT.
    const grant = await issueTestToolGrant({
      organizationId: TEST_ORG,
      snapshot: sampleSnapshotWithoutTools,
    });
    const isToolAllowed = createPublishedVersionToolAuthorizer(grant);
    const engine = new ToolExecutionEngine({ registry, isToolAllowed });

    const context: ToolExecutionContext = buildPublishedVersionToolExecutionContext(grant);

    const invocation: ToolInvocation = {
      toolName: 'agent.operating_hours',
      rawArguments: {},
    };

    const result = await engine.executeTool(invocation, context);
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('UNAUTHORIZED_TOOL');
      expect(result.message).toContain('is not authorized');
    }
  });

  it('ensures model arguments cannot forge or bypass toolset authority', async () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(createOperatingHoursToolDefinition());

    // TEST_CHANGE_REASON = D8B_GRANT_BINDING (DEC-048), ASSERTION_EQUIVALENT.
    const grant = await issueTestToolGrant({
      organizationId: TEST_ORG,
      snapshot: sampleSnapshotWithoutTools,
    });
    const isToolAllowed = createPublishedVersionToolAuthorizer(grant);
    const engine = new ToolExecutionEngine({ registry, isToolAllowed });

    const context: ToolExecutionContext = buildPublishedVersionToolExecutionContext(grant);

    // Adversarial model argument attempting to inject tool authorization
    const adversarialInvocation: ToolInvocation = {
      toolName: 'agent.operating_hours',
      rawArguments: {
        tools: ['agent.operating_hours'],
        organizationId: 'forged-org',
        isAuthorized: true,
      },
    };

    const result = await engine.executeTool(adversarialInvocation, context);
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('UNAUTHORIZED_TOOL');
    }
  });
});
