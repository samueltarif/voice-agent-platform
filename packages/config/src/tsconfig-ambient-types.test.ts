import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function parse(tsconfigPath: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(tsconfigPath, (p) => ts.sys.readFile(p));
  return ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(tsconfigPath));
}

const workspaceTsconfigs = ts.sys
  .readDirectory(
    repoRoot,
    ['.json'],
    ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    ['tsconfig.json', 'apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
  )
  .filter((p) => p.endsWith('/tsconfig.json'));

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Substitui a `lib` padrão (ES2022 = 58 arquivos, ~0,7 s de parsing a frio):
 * a resolução de `types`/`typeRoots` não depende de `lib`. Todas as demais
 * opções vêm do `tsconfig.base.json` real.
 */
const MINIMAL_GLOBALS = [
  'interface Array<T> { length: number; [n: number]: T }',
  'interface Boolean {}',
  'interface CallableFunction {}',
  'interface Function {}',
  'interface IArguments {}',
  'interface NewableFunction {}',
  'interface Number {}',
  'interface Object {}',
  'interface RegExp {}',
  'interface String {}',
  '',
].join('\n');

/**
 * Regressão (gate Windows da PR #129): sem `typeRoots` explícito, o TypeScript
 * usa todo `node_modules/@types` encontrado SUBINDO diretórios — inclusive fora
 * do repositório (ex.: `D:\node_modules\@types`) — tanto para incluir tipos
 * implícitos quanto para resolver `/// <reference types="node" />` (de
 * `@types/pg`). Um `@types/node` externo substituiu o do workspace e esvaziou
 * `Response`/`Request`/`Headers` (288 erros TS2339 na API).
 *
 * Fixture mínima e autocontida (compilador real, opções reais do
 * `tsconfig.base.json`): os dois `@types/node` são sintéticos e pequenos, para
 * que o resultado não dependa do que existe acima do diretório temporário nem
 * do custo de compilar o `@types/node` real (~100 arquivos) e a `lib` padrão —
 * o que estourava 5 s no Windows sob a carga paralela do gate.
 */
describe('tsconfig: ambient @types never leak in from outside the workspace', () => {
  // Caminho canônico: o TypeScript compara arquivos já resolvidos (realpath);
  // tmpdir pode ser link simbólico ou nome curto 8.3 no Windows.
  const sandbox = realpathSync.native(mkdtempSync(join(tmpdir(), 'ambient-types-')));
  // Layout pnpm: o workspace não tem `node_modules/@types` próprio; `@types/node`
  // só chega pela referência de uma biblioteca (como `@types/pg`), com o
  // `@types/node` correto como irmão no store.
  const strayNode = join(sandbox, 'node_modules/@types/node/index.d.ts');
  const store = join(sandbox, 'ws/node_modules/.pnpm/lib@1.0.0/node_modules');
  const workspaceNode = join(store, '@types/node/index.d.ts');
  const project = join(sandbox, 'ws/apps/api');
  const probe = join(project, 'probe.ts');
  const minimalGlobals = join(project, 'minimal-globals.d.ts');

  beforeAll(() => {
    const pkg = (version: string) =>
      `{"name":"@types/node","version":"${version}","types":"index.d.ts"}`;
    write(join(dirname(strayNode), 'package.json'), pkg('0.0.0-stray'));
    write(strayNode, 'interface Response {}\n');
    write(join(dirname(workspaceNode), 'package.json'), pkg('0.0.0-workspace'));
    write(workspaceNode, 'interface Response {\n  readonly status: number;\n}\n');
    write(join(store, 'lib/index.d.ts'), '/// <reference types="node" />\nexport {};\n');
    write(minimalGlobals, MINIMAL_GLOBALS);
    write(
      probe,
      "import type {} from '../../node_modules/.pnpm/lib@1.0.0/node_modules/lib/index.js';\n" +
        'declare const res: Response;\n' +
        'export const status: number = res.status;\n',
    );
  });
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  const norm = (p: string) => p.replaceAll('\\', '/').toLowerCase();

  function compileProbe(options: ts.CompilerOptions) {
    const { lib: _lib, ...rest } = options;
    const program = ts.createProgram({
      rootNames: [minimalGlobals, probe],
      options: {
        ...rest,
        noLib: true,
        noEmit: true,
        configFilePath: join(project, 'tsconfig.json'),
      },
    });
    const loaded = new Set(program.getSourceFiles().map((f) => norm(f.fileName)));
    return {
      diagnostics: ts
        .getPreEmitDiagnostics(program, program.getSourceFile(probe))
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
      loadedStray: loaded.has(norm(strayNode)),
      loadedWorkspaceNode: loaded.has(norm(workspaceNode)),
    };
  }

  const baseOptions = () => parse(join(repoRoot, 'tsconfig.base.json')).options;

  it('every workspace tsconfig pins `types` explicitly', () => {
    expect(workspaceTsconfigs.length).toBeGreaterThanOrEqual(13);
    for (const path of workspaceTsconfigs) {
      expect([path, Array.isArray(parse(path).options.types)]).toEqual([path, true]);
    }
  });

  it('control: without pinned typeRoots (even with types: []), the stray @types/node wins', () => {
    const { typeRoots: _typeRoots, ...unpinned } = baseOptions();
    const result = compileProbe({ ...unpinned, types: [] });
    expect(result).toEqual({
      diagnostics: ["Property 'status' does not exist on type 'Response'."],
      loadedStray: true,
      loadedWorkspaceNode: false,
    });
  });

  it('with the base configuration the stray package is ignored', () => {
    const base = baseOptions();
    expect([base.types, base.typeRoots]).toEqual([[], []]);
    expect(compileProbe(base)).toEqual({
      diagnostics: [],
      loadedStray: false,
      loadedWorkspaceNode: true,
    });
  });
});
