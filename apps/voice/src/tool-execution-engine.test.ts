import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition, ToolExecutionContext, ToolInvocation } from '@voice-agent/contracts';
import { InMemoryToolRegistry } from './tool-registry.js';
import { ToolExecutionEngine } from './tool-execution-engine.js';

describe('ToolExecutionEngine', () => {
  const baseContext: ToolExecutionContext = {
    organizationId: 'org_trusted_111',
    agentId: 'agt_trusted_222',
    agentVersionId: 'agv_trusted_333',
    callId: 'call_trusted_444',
    turnId: 'turn_trusted_555',
    correlationId: 'corr_trusted_666',
  };

  it('executes a registered tool successfully', async () => {
    const registry = new InMemoryToolRegistry();
    const mockExecute = vi.fn().mockResolvedValue({ processed: true, value: 42 });

    const echoTool: ToolDefinition<{ val: number }, { processed: boolean; value: number }> = {
      name: 'math.double',
      validateInput: (args) => {
        if (
          typeof args === 'object' &&
          args !== null &&
          'val' in args &&
          typeof (args as { val: unknown }).val === 'number'
        ) {
          return { success: true, data: { val: (args as { val: number }).val } };
        }
        return { success: false, error: 'val must be a number' };
      },
      execute: mockExecute,
    };
    registry.registerTool(echoTool);

    const engine = new ToolExecutionEngine({ registry });
    const invocation: ToolInvocation = {
      toolName: 'math.double',
      invocationId: 'inv_001',
      rawArguments: { val: 21 },
    };

    const result = await engine.executeTool(invocation, baseContext);

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.toolName).toBe('math.double');
      expect(result.invocationId).toBe('inv_001');
      expect(result.output).toEqual({ processed: true, value: 42 });
    }
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an unknown tool is invoked', async () => {
    const registry = new InMemoryToolRegistry();
    const engine = new ToolExecutionEngine({ registry });

    const invocation: ToolInvocation = {
      toolName: 'unknown.tool',
      invocationId: 'inv_002',
      rawArguments: {},
    };

    const result = await engine.executeTool(invocation, baseContext);

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('UNKNOWN_TOOL');
      expect(result.message).toContain('not registered');
    }
  });

  it('rejects invalid arguments and DOES NOT call the handler', async () => {
    const registry = new InMemoryToolRegistry();
    const handlerSpy = vi.fn().mockResolvedValue({ ok: true });

    const strictTool: ToolDefinition<{ count: number }, { ok: boolean }> = {
      name: 'inventory.check',
      validateInput: (args) => {
        if (
          typeof args === 'object' &&
          args !== null &&
          'count' in args &&
          typeof (args as { count: unknown }).count === 'number'
        ) {
          return { success: true, data: { count: (args as { count: number }).count } };
        }
        return { success: false, error: 'count is required and must be a number' };
      },
      execute: handlerSpy,
    };
    registry.registerTool(strictTool);

    const engine = new ToolExecutionEngine({ registry });
    const invocation: ToolInvocation = {
      toolName: 'inventory.check',
      invocationId: 'inv_003',
      rawArguments: { count: 'not_a_number' },
    };

    const result = await engine.executeTool(invocation, baseContext);

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.reason).toBe('INVALID_ARGUMENTS');
      expect(result.message).toContain('count is required and must be a number');
    }
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('passes trusted execution context to handler unchanged', async () => {
    const registry = new InMemoryToolRegistry();
    const holder = { context: undefined as ToolExecutionContext | undefined };

    const ctxInspectorTool: ToolDefinition<Record<string, unknown>, { inspected: boolean }> = {
      name: 'system.inspect',
      validateInput: () => ({ success: true, data: {} }),
      execute: async (_input, ctx) => {
        holder.context = ctx;
        return { inspected: true };
      },
    };
    registry.registerTool(ctxInspectorTool);

    const engine = new ToolExecutionEngine({ registry });
    const invocation: ToolInvocation = {
      toolName: 'system.inspect',
      rawArguments: {},
    };

    await engine.executeTool(invocation, baseContext);

    expect(holder.context).toEqual(baseContext);
    expect(holder.context?.organizationId).toBe('org_trusted_111');
    expect(holder.context?.callId).toBe('call_trusted_444');
  });

  it('prevents model-provided arguments from overriding trusted context (security boundary)', async () => {
    const registry = new InMemoryToolRegistry();
    const holder = { context: undefined as ToolExecutionContext | undefined };

    const auditTool: ToolDefinition<{ note: string }, { done: boolean }> = {
      name: 'audit.log',
      validateInput: (args) => {
        const obj = args as { note?: string };
        return { success: true, data: { note: String(obj?.note ?? '') } };
      },
      execute: async (_input, ctx) => {
        holder.context = ctx;
        return { done: true };
      },
    };
    registry.registerTool(auditTool);

    const engine = new ToolExecutionEngine({ registry });
    // Untrusted model arguments trying to forge tenant and permissions
    const maliciousInvocation: ToolInvocation = {
      toolName: 'audit.log',
      rawArguments: {
        note: 'malicious prompt injection',
        organizationId: 'FORGED_ORG_666',
        agentId: 'FORGED_AGENT',
        role: 'SUPERADMIN',
        permissions: ['ALL'],
      },
    };

    await engine.executeTool(maliciousInvocation, baseContext);

    expect(holder.context?.organizationId).toBe('org_trusted_111');
    expect(holder.context?.agentId).toBe('agt_trusted_222');
    expect(
      (holder.context as unknown as Record<string, unknown> | undefined)?.organizationId,
    ).not.toBe('FORGED_ORG_666');
  });

  it('contains handler exceptions and converts to sanitized canonical failure without leaking secrets', async () => {
    const registry = new InMemoryToolRegistry();

    const crashingTool: ToolDefinition<Record<string, unknown>, never> = {
      name: 'system.crash',
      validateInput: () => ({ success: true, data: {} }),
      execute: async () => {
        throw new Error(
          'Database connection failed: secret_postgres_password_12345 at 10.0.0.1:5432',
        );
      },
    };
    registry.registerTool(crashingTool);

    const engine = new ToolExecutionEngine({ registry });
    const invocation: ToolInvocation = {
      toolName: 'system.crash',
      invocationId: 'inv_crash',
      rawArguments: {},
    };

    const result = await engine.executeTool(invocation, baseContext);

    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.reason).toBe('EXECUTION_FAILED');
      expect(result.message).toBe('Tool execution failed');
      // Verify sensitive details are not leaked in the model-facing output
      expect(result.message).not.toContain('secret_postgres_password');
      expect(result.message).not.toContain('10.0.0.1');
    }
  });

  it('routes two different tool identities to their respective handlers', async () => {
    const registry = new InMemoryToolRegistry();
    const toolA: ToolDefinition<{ x: number }, { tool: string; val: number }> = {
      name: 'math.add10',
      validateInput: (args) => ({ success: true, data: { x: Number((args as { x: unknown }).x) } }),
      execute: async (input) => ({ tool: 'A', val: input.x + 10 }),
    };
    const toolB: ToolDefinition<{ str: string }, { tool: string; len: number }> = {
      name: 'string.len',
      validateInput: (args) => ({
        success: true,
        data: { str: String((args as { str: unknown }).str) },
      }),
      execute: async (input) => ({ tool: 'B', len: input.str.length }),
    };
    registry.registerTool(toolA);
    registry.registerTool(toolB);

    const engine = new ToolExecutionEngine({ registry });

    const resA = await engine.executeTool(
      { toolName: 'math.add10', rawArguments: { x: 5 } },
      baseContext,
    );
    const resB = await engine.executeTool(
      { toolName: 'string.len', rawArguments: { str: 'hello' } },
      baseContext,
    );

    expect(resA.status).toBe('SUCCESS');
    if (resA.status === 'SUCCESS') {
      expect(resA.output).toEqual({ tool: 'A', val: 15 });
    }

    expect(resB.status).toBe('SUCCESS');
    if (resB.status === 'SUCCESS') {
      expect(resB.output).toEqual({ tool: 'B', len: 5 });
    }
  });

  it('enforces tool authorization boundary when isToolAllowed is configured', async () => {
    const registry = new InMemoryToolRegistry();
    const tool: ToolDefinition<Record<string, unknown>, { ok: boolean }> = {
      name: 'admin.privileged_tool',
      validateInput: () => ({ success: true, data: {} }),
      execute: async () => ({ ok: true }),
    };
    registry.registerTool(tool);

    const engine = new ToolExecutionEngine({
      registry,
      isToolAllowed: (toolName, ctx) => {
        // Disallow for tenant org_unauthorized
        return ctx.organizationId !== 'org_unauthorized';
      },
    });

    const unauthorizedCtx: ToolExecutionContext = { organizationId: 'org_unauthorized' };
    const resUnauthorized = await engine.executeTool(
      { toolName: 'admin.privileged_tool', rawArguments: {} },
      unauthorizedCtx,
    );
    expect(resUnauthorized.status).toBe('REJECTED');
    if (resUnauthorized.status === 'REJECTED') {
      expect(resUnauthorized.reason).toBe('UNAUTHORIZED_TOOL');
    }

    const authorizedCtx: ToolExecutionContext = { organizationId: 'org_allowed' };
    const resAuthorized = await engine.executeTool(
      { toolName: 'admin.privileged_tool', rawArguments: {} },
      authorizedCtx,
    );
    expect(resAuthorized.status).toBe('SUCCESS');
  });

  it('enforces strict cross-tenant isolation', async () => {
    const registry = new InMemoryToolRegistry();
    const executionsByOrg: string[] = [];

    const tenantTool: ToolDefinition<Record<string, unknown>, { org: string }> = {
      name: 'tenant.record',
      validateInput: () => ({ success: true, data: {} }),
      execute: async (_input, ctx) => {
        executionsByOrg.push(ctx.organizationId);
        return { org: ctx.organizationId };
      },
    };
    registry.registerTool(tenantTool);

    const engine = new ToolExecutionEngine({ registry });

    const tenantA: ToolExecutionContext = { organizationId: 'tenant_alpha' };
    const tenantB: ToolExecutionContext = { organizationId: 'tenant_beta' };

    const resultA = await engine.executeTool({ toolName: 'tenant.record' }, tenantA);
    const resultB = await engine.executeTool({ toolName: 'tenant.record' }, tenantB);

    expect(resultA.status).toBe('SUCCESS');
    if (resultA.status === 'SUCCESS') {
      expect(resultA.output).toEqual({ org: 'tenant_alpha' });
    }

    expect(resultB.status).toBe('SUCCESS');
    if (resultB.status === 'SUCCESS') {
      expect(resultB.output).toEqual({ org: 'tenant_beta' });
    }

    expect(executionsByOrg).toEqual(['tenant_alpha', 'tenant_beta']);
  });
});
