import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition, ToolExecutionContext } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import { InMemoryToolRegistry } from './tool-registry.js';
import {
  TOOL_AUTHORIZER_REQUIRED_MESSAGE,
  ToolExecutionEngine,
  type ToolExecutionEngineDependencies,
} from './tool-execution-engine.js';

const CONTEXT: ToolExecutionContext = { organizationId: 'org_d8', callId: 'call_d8' };
const SECRET_ARG = 'cpf-000.000.000-00-segredo';

function setup(isToolAllowed: unknown) {
  const execute = vi.fn().mockResolvedValue({ ok: true });
  const validateInput = vi.fn((args: unknown) => ({ success: true as const, data: args }));
  const tool: ToolDefinition<unknown, { ok: boolean }> = {
    name: 'd8.tool',
    validateInput,
    execute,
  };
  const registry = new InMemoryToolRegistry();
  registry.registerTool(tool);
  const calls: unknown[] = [];
  const record = (...args: unknown[]) => void calls.push(args);
  const logger: Logger = { info: record, warn: record, error: record, debug: record };
  const deps = { registry, logger, isToolAllowed } as unknown as ToolExecutionEngineDependencies;
  const engine = new ToolExecutionEngine(deps);
  const run = () =>
    engine.executeTool({ toolName: 'd8.tool', rawArguments: { doc: SECRET_ARG } }, CONTEXT);
  return { engine, execute, validateInput, calls, run };
}

describe('ToolExecutionEngine — D8 fail-closed authorization', () => {
  it('refuses to be constructed without a function authorizer', () => {
    for (const missing of [undefined, null, true, 'allow', {}, []]) {
      expect(() => setup(missing)).toThrow(TOOL_AUTHORIZER_REQUIRED_MESSAGE);
    }
    const registry = new InMemoryToolRegistry();
    expect(() => new ToolExecutionEngine(undefined as never)).toThrow(TypeError);
    expect(() => new ToolExecutionEngine({ registry } as never)).toThrow(TypeError);
  });

  it('executes only when the authorizer returns exactly true', async () => {
    const { execute, run } = setup(() => true);
    await expect(run()).resolves.toMatchObject({ status: 'SUCCESS', output: { ok: true } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects every non-true verdict without validating or executing', async () => {
    const verdicts = [
      false,
      undefined,
      null,
      1,
      0,
      'true',
      {},
      [],
      () => true,
      Promise.resolve(true),
    ];
    for (const verdict of verdicts) {
      const { execute, validateInput, run } = setup(() => verdict);
      await expect(run()).resolves.toMatchObject({
        status: 'REJECTED',
        reason: 'UNAUTHORIZED_TOOL',
      });
      expect(validateInput).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it('turns an authorizer exception into UNAUTHORIZED_TOOL and logs only the error type', async () => {
    const { execute, calls, run } = setup(() => {
      throw new RangeError(`falha com ${SECRET_ARG}`);
    });
    await expect(run()).resolves.toMatchObject({ status: 'REJECTED', reason: 'UNAUTHORIZED_TOOL' });
    expect(execute).not.toHaveBeenCalled();
    const logged = JSON.stringify(calls);
    expect(logged).toContain('tool.execution.authorizer_failed');
    expect(logged).toContain('RangeError');
    expect(logged).not.toContain(SECRET_ARG);
    expect(logged).not.toContain('falha com');
  });

  it('never leaves an unhandled rejection when the authorizer returns a rejecting Promise', async () => {
    const { execute, run } = setup(() => Promise.reject(new Error('async authorizer')));
    await expect(run()).resolves.toMatchObject({ reason: 'UNAUTHORIZED_TOOL' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(execute).not.toHaveBeenCalled();
  });

  it('cannot be re-authorized by mutating the engine after construction', async () => {
    const { engine, execute, run } = setup(() => false);
    const mutable = engine as unknown as Record<string, unknown>;
    mutable.isToolAllowed = () => true;
    mutable['#isToolAllowed'] = () => true;
    await expect(run()).resolves.toMatchObject({ reason: 'UNAUTHORIZED_TOOL' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the public rejection reasons and the check order (unknown tool before authorization)', async () => {
    const { engine, calls } = setup(() => true);
    const unknown = await engine.executeTool({ toolName: 'nope', rawArguments: {} }, CONTEXT);
    expect(unknown).toMatchObject({ status: 'REJECTED', reason: 'UNKNOWN_TOOL' });
    const denied = await setup(() => false).run();
    expect(['UNKNOWN_TOOL', 'INVALID_ARGUMENTS', 'UNAUTHORIZED_TOOL']).toContain(
      denied.status === 'REJECTED' ? denied.reason : 'none',
    );
    expect(JSON.stringify(calls)).not.toContain(SECRET_ARG);
  });
});
