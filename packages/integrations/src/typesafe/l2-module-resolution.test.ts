import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

  it('verifies packages/errors export contract routes runtime to dist and types to src', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/errors/package.json'), 'utf8'),
    );
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.exports?.['.']?.import).toBe('./dist/index.js');
    expect(pkg.exports?.['.']?.default).toBe('./dist/index.js');
    expect(pkg.exports?.['.']?.types).toBe('./src/index.ts');
    expect(pkg.types).toBe('./src/index.ts');
  });

  it('verifies packages/errors build configuration produces dist output', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/errors/package.json'), 'utf8'),
    );
    expect(pkg.scripts?.build).toBe('tsc');

    const tsconfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/errors/tsconfig.json'), 'utf8'),
    );
    expect(tsconfig.compilerOptions?.outDir).toBe('./dist');
    expect(tsconfig.include).toContain('src/**/*');
  });

  it('verifies packages/errors source exports define ConversationModelError for OpenAI adapter', () => {
    const indexSource = readFileSync(
      resolve(process.cwd(), 'packages/errors/src/index.ts'),
      'utf8',
    );
    expect(indexSource).toContain("export * from './voice-errors.js'");

    const voiceErrorsSource = readFileSync(
      resolve(process.cwd(), 'packages/errors/src/voice-errors.ts'),
      'utf8',
    );
    expect(voiceErrorsSource).toContain('class ConversationModelError');
  });

  it('verifies L2 runner dependency loader targets compiled dist artifacts', () => {
    const depsSource = readFileSync(
      resolve(process.cwd(), 'scripts/benchmarks/voice/l2-runner-dependencies.mjs'),
      'utf8',
    );
    expect(depsSource).toContain('packages/integrations/dist/packages/integrations/src/typesafe');
    expect(depsSource).toContain('packages/integrations/dist/packages/integrations/src/openai');
    expect(depsSource).toContain(
      'apps/voice/dist/apps/voice/src/operating-hours-capability-matcher.js',
    );
    expect(depsSource).toContain('apps/voice/dist/apps/voice/src/frozen-policy-interpreter.js');
    expect(depsSource).toContain('apps/voice/dist/apps/voice/src/operating-hours-turn-handler.js');
  });
});
