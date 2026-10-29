import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function parse(tsconfigPath: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(tsconfigPath, (p) => ts.sys.readFile(p));
  return ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(tsconfigPath));
}

/** `@types/node` real do workspace (o mesmo que a API recebe via `@types/pg`). */
function nodeTypesEntry(): string {
  const fromDatabase = createRequire(join(repoRoot, 'packages/database/package.json'));
  const fromPg = createRequire(fromDatabase.resolve('@types/pg/package.json'));
  return join(dirname(fromPg.resolve('@types/node/package.json')), 'index.d.ts');
}

const workspaceTsconfigs = ts.sys
  .readDirectory(
    repoRoot,
    ['.json'],
    ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    ['tsconfig.json', 'apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
  )
  .filter((p) => p.endsWith('/tsconfig.json'));

/**
 * Regressão (gate Windows da PR #129): sem `types` explícito, o TypeScript
 * inclui todo `node_modules/@types` encontrado SUBINDO diretórios — inclusive
 * fora do repositório (ex.: `D:\node_modules\@types`). Um `@types/node`
 * estranho ali, sem `undici-types` resolvível, esvaziava `Response`/`Request`/
 * `Headers` (288 erros TS2339 na API), mascarado por `skipLibCheck`.
 */
describe('tsconfig: ambient @types never leak in from outside the workspace', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'ambient-types-'));
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  it('every workspace tsconfig pins `types` explicitly', () => {
    expect(workspaceTsconfigs.length).toBeGreaterThanOrEqual(13);
    for (const path of workspaceTsconfigs) {
      expect([path, Array.isArray(parse(path).options.types)]).toEqual([path, true]);
    }
  });

  /**
   * Reproduz o layout real: o workspace (`ws/`) não tem `node_modules/@types`
   * próprio (pnpm isolado); `@types/node` só chega por uma biblioteca com
   * `/// <reference types="node" />` (como `@types/pg`), que tem o `@types/node`
   * correto como irmão no store. Um diretório ACIMA do workspace contém uma
   * cópia de `@types/node` sem `undici-types` resolvível (cenário do Windows).
   */
  function diagnosticsFor(pinned: boolean): string[] {
    const realNode = dirname(nodeTypesEntry());
    const realUndici = dirname(
      createRequire(join(realNode, 'package.json')).resolve('undici-types/package.json'),
    );
    const ws = join(sandbox, 'ws');
    const store = join(ws, 'node_modules/.pnpm/lib@1.0.0/node_modules');
    if (!existsSync(join(sandbox, 'node_modules'))) {
      cpSync(realNode, join(sandbox, 'node_modules/@types/node'), {
        recursive: true,
        dereference: true,
      });
      cpSync(realNode, join(store, '@types/node'), { recursive: true, dereference: true });
      cpSync(realUndici, join(store, 'undici-types'), { recursive: true, dereference: true });
      mkdirSync(join(store, 'lib'), { recursive: true });
      writeFileSync(join(store, 'lib/index.d.ts'), '/// <reference types="node" />\nexport {};\n');
    }
    const project = join(ws, 'apps/api');
    mkdirSync(project, { recursive: true });
    const probe = join(project, 'probe.ts');
    writeFileSync(
      probe,
      "import type {} from '../../node_modules/.pnpm/lib@1.0.0/node_modules/lib/index.js';\n" +
        'declare const res: Response;\n' +
        'export const status: number = res.status;\n',
    );
    const {
      types: _baseTypes,
      typeRoots: _baseRoots,
      ...base
    } = parse(join(repoRoot, 'tsconfig.base.json')).options;
    const options: ts.CompilerOptions = {
      ...base,
      ...(pinned ? { types: [], typeRoots: [] } : {}),
      noEmit: true,
      configFilePath: join(project, 'tsconfig.json'),
    };
    const program = ts.createProgram({ rootNames: [probe], options });
    const probeFile = program.getSourceFile(probe);
    return ts
      .getPreEmitDiagnostics(program, probeFile)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }

  it('control: a stray @types/node above the project empties Response (the Windows failure)', () => {
    expect(diagnosticsFor(false).join('\n')).toContain("Property 'status' does not exist");
  });

  it('with the base configuration the stray package is ignored', () => {
    const base = parse(join(repoRoot, 'tsconfig.base.json')).options;
    expect([base.types, base.typeRoots]).toEqual([[], []]);
    expect(diagnosticsFor(true)).toEqual([]);
  });
});
