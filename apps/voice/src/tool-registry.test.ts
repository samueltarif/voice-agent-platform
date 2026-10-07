import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@voice-agent/contracts';
import { DuplicateToolRegistrationError, InMemoryToolRegistry } from './tool-registry.js';

describe('InMemoryToolRegistry', () => {
  const dummyToolA: ToolDefinition<{ input: string }, { output: string }> = {
    name: 'test.tool_a',
    validateInput: (args) => ({ success: true, data: { input: String(args) } }),
    execute: async (input) => ({ output: input.input }),
  };

  const dummyToolB: ToolDefinition<{ val: number }, { res: number }> = {
    name: 'test.tool_b',
    validateInput: (args) => ({ success: true, data: { val: Number(args) } }),
    execute: async (input) => ({ res: input.val * 2 }),
  };

  it('registers and retrieves tools by canonical name', () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(dummyToolA);
    registry.registerTool(dummyToolB);

    expect(registry.hasTool('test.tool_a')).toBe(true);
    expect(registry.hasTool('test.tool_b')).toBe(true);
    expect(registry.hasTool('test.unknown')).toBe(false);

    const tool = registry.getTool('test.tool_a');
    expect(tool?.name).toBe('test.tool_a');
    expect(registry.listToolNames()).toEqual(['test.tool_a', 'test.tool_b']);
  });

  it('rejects duplicate registration deterministically', () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(dummyToolA);

    expect(() => registry.registerTool(dummyToolA)).toThrowError(DuplicateToolRegistrationError);
  });

  it('prevents silent replacement of registered tool', () => {
    const registry = new InMemoryToolRegistry();
    registry.registerTool(dummyToolA);

    const replacementTool: ToolDefinition<unknown, unknown> = {
      name: 'test.tool_a',
      validateInput: () => ({ success: true, data: {} }),
      execute: async () => ({ output: 'replaced' }),
    };

    expect(() => registry.registerTool(replacementTool)).toThrowError(
      DuplicateToolRegistrationError,
    );

    // Verify original tool was not replaced
    expect(registry.getTool('test.tool_a')).toBe(dummyToolA);
  });

  it('rejects invalid or empty tool names', () => {
    const registry = new InMemoryToolRegistry();
    const emptyNameTool: ToolDefinition<unknown, unknown> = {
      name: '   ',
      validateInput: () => ({ success: true, data: {} }),
      execute: async () => ({}),
    };

    expect(() => registry.registerTool(emptyNameTool)).toThrowError(
      'Tool must have a non-empty canonical name',
    );
  });

  it('returns undefined for unknown tool lookups without throwing', () => {
    const registry = new InMemoryToolRegistry();
    expect(registry.getTool('nonexistent.tool')).toBeUndefined();
  });
});
