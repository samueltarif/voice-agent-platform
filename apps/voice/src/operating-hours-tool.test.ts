import { describe, expect, it } from 'vitest';
import type {
  AgentConfigurationSnapshotV1,
  OperatingHoursToolOutput,
  ToolExecutionContext,
} from '@voice-agent/contracts';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';
import {
  createOperatingHoursToolDefinition,
  OPERATING_HOURS_TOOL_NAME,
} from './operating-hours-tool.js';

describe('operating-hours-tool integration with ToolExecutionEngine', () => {
  const orgA = '11111111-1111-4111-8111-111111111111';

  const sampleSnapshot: AgentConfigurationSnapshotV1 = {
    persona: {
      role: 'Atendente Virtual',
      companyName: 'Qualitec',
      objective: 'Atendimento geral',
      tone: 'FORMAL',
      greetingPhrase: 'Olá, como posso ajudar?',
      closingPhrase: 'Tenha um bom dia!',
      fallbackPhrase: 'Não compreendi.',
    },
    voice: {
      languageCode: 'pt-BR',
    },
    rules: {
      conversational: ['Seja breve'],
      deterministic: {
        operatingHours: 'Segunda a Sexta, das 09h às 18h',
      },
    },
  };

  it('has the canonical tool name matching OPERATING_HOURS_CAPABILITY_ID', () => {
    const tool = createOperatingHoursToolDefinition();
    expect(tool.name).toBe(OPERATING_HOURS_TOOL_NAME);
    expect(tool.name).toBe('agent.operating_hours');
  });

  it('executes successfully through ToolExecutionEngine with snapshot in context', async () => {
    const registry = new InMemoryToolRegistry();
    const tool = createOperatingHoursToolDefinition();
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({ registry });
    const context: ToolExecutionContext = {
      organizationId: orgA,
      snapshot: sampleSnapshot,
    };

    const result = await engine.executeTool(
      {
        toolName: OPERATING_HOURS_TOOL_NAME,
        invocationId: 'inv_op_1',
        rawArguments: { query: 'Qual é o horário de atendimento de vocês?' },
      },
      context,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      const output = result.output as OperatingHoursToolOutput;
      expect(output.handled).toBe(true);
      expect(output.responseText).toBe(
        'Nosso horário de atendimento é: Segunda a Sexta, das 09h às 18h.',
      );
    }
  });

  it('executes successfully using defaultOperatingHours option when not in snapshot', async () => {
    const registry = new InMemoryToolRegistry();
    const tool = createOperatingHoursToolDefinition({
      defaultOperatingHours: 'Segunda a Sábado das 8h às 20h',
    });
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({ registry });
    const context: ToolExecutionContext = {
      organizationId: orgA,
    };

    const result = await engine.executeTool(
      {
        toolName: OPERATING_HOURS_TOOL_NAME,
        rawArguments: { query: 'Até que horas vocês atendem?' },
      },
      context,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      const output = result.output as OperatingHoursToolOutput;
      expect(output.handled).toBe(true);
      expect(output.responseText).toBe(
        'Nosso horário de atendimento é: Segunda a Sábado das 8h às 20h.',
      );
    }
  });

  it('returns handled=false when operating hours are not configured', async () => {
    const registry = new InMemoryToolRegistry();
    const tool = createOperatingHoursToolDefinition();
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({ registry });
    const contextWithoutHours: ToolExecutionContext = {
      organizationId: orgA,
      snapshot: {
        ...sampleSnapshot,
        rules: {
          ...sampleSnapshot.rules,
          deterministic: {},
        },
      },
    };

    const result = await engine.executeTool(
      {
        toolName: OPERATING_HOURS_TOOL_NAME,
        rawArguments: { query: 'Qual o horário?' },
      },
      contextWithoutHours,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      const output = result.output as OperatingHoursToolOutput;
      expect(output.handled).toBe(false);
      expect(output.responseText).toBeNull();
    }
  });

  it('returns handled=false when transcript is not eligible for operating hours', async () => {
    const registry = new InMemoryToolRegistry();
    const tool = createOperatingHoursToolDefinition();
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({ registry });
    const context: ToolExecutionContext = {
      organizationId: orgA,
      snapshot: sampleSnapshot,
    };

    const result = await engine.executeTool(
      {
        toolName: OPERATING_HOURS_TOOL_NAME,
        rawArguments: { query: 'Qual é o preço do produto?' },
      },
      context,
    );

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      const output = result.output as OperatingHoursToolOutput;
      expect(output.handled).toBe(false);
      expect(output.responseText).toBeNull();
    }
  });

  it('rejects invalid argument shapes via strict schema validation', async () => {
    const registry = new InMemoryToolRegistry();
    const tool = createOperatingHoursToolDefinition();
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({ registry });
    const context: ToolExecutionContext = { organizationId: orgA };

    const result = await engine.executeTool(
      {
        toolName: OPERATING_HOURS_TOOL_NAME,
        rawArguments: { unrecognizedField: 'hack', query: 'horário' },
      },
      context,
    );

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('INVALID_ARGUMENTS');
      expect(result.message).toContain('unrecognizedField');
    }
  });
});
