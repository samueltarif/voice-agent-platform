import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

describe('L2 Runtime Module Resolution Regression (Slice 006AZ)', () => {
  it('reproduces historical failure when Node attempts direct import of source index.ts', () => {
    const sourceIndexUrl = pathToFileURL(
      resolve(process.cwd(), 'packages/errors/src/index.ts'),
    ).href;
    const child = spawnSync('node', ['--input-type=module', '-e', `import('${sourceIndexUrl}')`], {
      encoding: 'utf8',
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('Cannot find module');
    expect(child.stderr).toContain('app-error.js');
  });

  it('verifies canonical runner initializes offline without module resolution error', () => {
    const runnerScript = resolve(
      process.cwd(),
      'scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs',
    );
    const child = spawnSync('node', [runnerScript, '--offline', '--dry-run-write'], {
      encoding: 'utf8',
    });
    expect(child.stderr).not.toContain('Cannot find module');
    expect(child.stderr).not.toContain('app-error.js');
    expect(child.stdout).toContain('route=GENERATIVE');
    expect(child.stderr).toContain('[L2 Runner] Study did not pass: PROVIDER_FAILURE');
  });

  it('verifies loadDependencies loads all required adapters and interpreter functions', async () => {
    const { loadDependencies } =
      await import('../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs');
    const deps = await loadDependencies();
    expect(deps.TypeSafeJevTurnDecisionAdapter).toBeDefined();
    expect(deps.TypeSafeModelIdentityMismatchError).toBeDefined();
    expect(deps.OpenAiConversationModelAdapter).toBeDefined();
    expect(deps.matchesOperatingHoursCapability).toBeDefined();
    expect(deps.interpretFrozenTurnPolicy).toBeDefined();
    expect(deps.handleOperatingHoursTurn).toBeDefined();
  });

  it('verifies @voice-agent/errors exports ConversationModelError for OpenAI adapter', async () => {
    const errors = await import('@voice-agent/errors');
    expect(errors.ConversationModelError).toBeDefined();
    expect(errors.AppError).toBeDefined();
  });
});
