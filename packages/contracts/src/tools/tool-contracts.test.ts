import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createZodToolValidator,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolInvocation,
} from './index.js';

describe('Tool Contracts', () => {
  it('validates tool arguments with Zod validator correctly', () => {
    const schema = z.object({
      query: z.string().min(1),
      maxResults: z.number().int().positive().optional(),
    });
    const validator = createZodToolValidator(schema);

    const valid = validator({ query: 'horário', maxResults: 5 });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.query).toBe('horário');
      expect(valid.data.maxResults).toBe(5);
    }

    const invalid = validator({ query: '', maxResults: -1 });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error).toContain('String must contain at least 1 character');
    }
  });

  it('preserves trusted context contract structure', () => {
    const context: ToolExecutionContext = {
      organizationId: 'org_test_1',
      agentId: 'agt_test_1',
      agentVersionId: 'agv_test_1',
      callId: 'call_test_1',
      turnId: 'turn_test_1',
      correlationId: 'corr_test_1',
    };

    expect(context.organizationId).toBe('org_test_1');
    expect(context.agentId).toBe('agt_test_1');
    expect(context.callId).toBe('call_test_1');
  });

  it('supports canonical invocation and execution result shapes', async () => {
    const invocation: ToolInvocation = {
      toolName: 'test.lookup',
      invocationId: 'inv_123',
      rawArguments: { query: 'test' },
    };

    const toolDef: ToolDefinition<{ query: string }, { result: string }> = {
      name: 'test.lookup',
      validateInput: (raw) => {
        if (typeof raw === 'object' && raw !== null && 'query' in raw) {
          return { success: true, data: { query: String((raw as { query: unknown }).query) } };
        }
        return { success: false, error: 'query is required' };
      },
      execute: async (input, ctx) => {
        return { result: `${ctx.organizationId}:${input.query}` };
      },
    };

    const validated = toolDef.validateInput(invocation.rawArguments);
    expect(validated.success).toBe(true);
    if (validated.success) {
      const output = await toolDef.execute(validated.data, { organizationId: 'org_999' });
      const result: ToolExecutionResult<{ result: string }> = {
        status: 'SUCCESS',
        toolName: invocation.toolName,
        invocationId: invocation.invocationId,
        output,
      };
      expect(result.status).toBe('SUCCESS');
      expect(result.output.result).toBe('org_999:test');
    }
  });
});
