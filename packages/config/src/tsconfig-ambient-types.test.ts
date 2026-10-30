import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  // Caminho canônico: o TypeScript compara arquivos já resolvidos (realpath);
  // tmpdir pode ser link simbólico ou nome curto 8.3 no Windows.
  const sandbox = realpathSync.native(mkdtempSync(join(tmpdir(), 'ambient-types-')));
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
   * correto e o `undici-types` como irmãos no store.
   *
   * Um diretório ACIMA do workspace contém um `@types/node` ESTRANHO. Ele é
   * sintético e autocontido (não importa nada): seus `Response`/`Request`/
   * `Headers` são vazios — o efeito observado no Windows. Uma cópia do
   * `@types/node` real não serve de fixture: se algum diretório acima do
   * temporário do sistema tiver `undici-types` (ex.: `C:\Users\<u>\node_modules`),
   * a cópia "funciona" e o controle deixa de reproduzir a contaminação.
   */
  const strayNode = join(sandbox, 'node_modules/@types/node');
  const ws = join(sandbox, 'ws');
  const store = join(ws, 'node_modules/.pnpm/lib@1.0.0/node_modules');
  const project = join(ws, 'apps/api');
  const probe = join(project, 'probe.ts');

  function buildFixture(): void {
    if (existsSync(probe)) return;
    const realNode = dirname(nodeTypesEntry());
    const realUndici = dirname(
      createRequire(join(realNode, 'package.json')).resolve('undici-types/package.json'),
    );
    mkdirSync(strayNode, { recursive: true });
    writeFileSync(
      join(strayNode, 'package.json'),
      '{"name":"@types/node","version":"0.0.0-stray","types":"index.d.ts"}',
    );
    writeFileSync(
      join(strayNode, 'index.d.ts'),
      'interface Response {}\ninterface Request {}\ninterface Headers {}\n',
    );
    cpSync(realNode, join(store, '@types/node'), { recursive: true, dereference: true });
    cpSync(realUndici, join(store, 'undici-types'), { recursive: true, dereference: true });
    mkdirSync(join(store, 'lib'), { recursive: true });
    writeFileSync(join(store, 'lib/index.d.ts'), '/// <reference types="node" />\nexport {};\n');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      probe,
      "import type {} from '../../node_modules/.pnpm/lib@1.0.0/node_modules/lib/index.js';\n" +
        'declare const res: Response;\n' +
        'export const status: number = res.status;\n',
    );
  }

  const norm = (p: string) => p.replaceAll('\\', '/').toLowerCase();

  /** `withBaseTypePins`: usa `types`/`typeRoots` do `tsconfig.base.json` real; senão os remove. */
  function compileProbe(withBaseTypePins: boolean) {
    buildFixture();
    const parsed = parse(join(repoRoot, 'tsconfig.base.json')).options;
    const { types: _types, typeRoots: _typeRoots, ...unpinned } = parsed;
    const options: ts.CompilerOptions = {
      ...(withBaseTypePins ? parsed : unpinned),
      noEmit: true,
      configFilePath: join(project, 'tsconfig.json'),
    };
    const program = ts.createProgram({ rootNames: [probe], options });
    const loaded = program.getSourceFiles().map((f) => norm(f.fileName));
    return {
      diagnostics: ts
        .getPreEmitDiagnostics(program, program.getSourceFile(probe))
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
      loadedStray: loaded.includes(norm(join(strayNode, 'index.d.ts'))),
      loadedWorkspaceNode: loaded.includes(norm(join(store, '@types/node/index.d.ts'))),
    };
  }

  it('control: without the pins, a stray @types/node above the workspace replaces the real one', () => {
    const result = compileProbe(false);
    expect(result.loadedStray).toBe(true);
    expect(result.loadedWorkspaceNode).toBe(false);
    expect(result.diagnostics).toEqual(["Property 'status' does not exist on type 'Response'."]);
  });

  it('with the base configuration the stray package is ignored', () => {
    const base = parse(join(repoRoot, 'tsconfig.base.json')).options;
    expect([base.types, base.typeRoots]).toEqual([[], []]);
    const result = compileProbe(true);
    expect(result.loadedStray).toBe(false);
    expect(result.loadedWorkspaceNode).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
