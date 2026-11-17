import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Como iniciar o processo filho: argumentos do Node (flags + arquivo de entrada). */
export interface ChildLaunch {
  readonly args: readonly string[];
  /** Pasta real do `pdfjs-dist` (cMaps locais), repassada ao filho. */
  readonly pdfjsDir: string;
}

export interface ChildLaunchOptions {
  readonly maxOldGenerationSizeMb: number;
  /** Só testes: outro arquivo de entrada (falhas induzidas), com as mesmas restrições. */
  readonly entryFile?: string | undefined;
}

/** Dependências lidas pelo filho, por pacote do monorepo. */
const PACKAGE_DEPENDENCIES = {
  'knowledge-extraction': ['@voice-agent/contracts', 'fflate', 'pdfjs-dist'],
  contracts: ['zod'],
} as const;

interface Layout {
  readonly sourceMode: boolean;
  readonly packagesDir: string;
  readonly codeDirs: readonly string[];
  readonly entry: string;
  readonly preload: readonly string[];
}

function sourceLayout(here: string): Layout {
  const packagesDir = path.resolve(here, '../..');
  return {
    sourceMode: true,
    packagesDir,
    codeDirs: [here, path.join(packagesDir, 'contracts', 'src')],
    entry: path.join(here, 'extraction-child-entry.ts'),
    preload: [path.join(here, 'source-mode-loader.mjs')],
  };
}

/** API compilada: `apps/api/dist/packages/knowledge-extraction/src/`. */
function compiledLayout(here: string): Layout {
  const apiDir = path.resolve(here, '../../../..');
  const distPackages = path.join(apiDir, 'dist', 'packages');
  return {
    sourceMode: false,
    packagesDir: path.resolve(apiDir, '../../packages'),
    codeDirs: [
      path.join(distPackages, 'knowledge-extraction'),
      path.join(distPackages, 'contracts'),
      path.join(apiDir, 'register-dist-sync.js'),
      path.join(apiDir, 'dist-resolver.js'),
      path.join(apiDir, 'package.json'),
    ],
    entry: path.join(here, 'extraction-child-entry.js'),
    preload: [path.join(apiDir, 'register-dist-sync.js')],
  };
}

/** Leitura: código + `package.json`/`node_modules` dos pacotes + pastas REAIS das dependências (pnpm usa symlinks). */
function readAllowList(layout: Layout): string[] {
  const allowed = new Set(layout.codeDirs);
  for (const [pkg, deps] of Object.entries(PACKAGE_DEPENDENCIES)) {
    const root = path.join(layout.packagesDir, pkg);
    allowed.add(path.join(root, 'package.json'));
    allowed.add(path.join(root, 'node_modules'));
    for (const dep of deps) allowed.add(realpathSync(path.join(root, 'node_modules', dep)));
  }
  return [...allowed];
}

export function pdfjsDirectory(packagesDir: string): string {
  return realpathSync(path.join(packagesDir, 'knowledge-extraction', 'node_modules', 'pdfjs-dist'));
}

/**
 * `--permission` SEM `--allow-fs-write`, `--allow-child-process`,
 * `--allow-worker`, `--allow-addons` ou `--allow-wasi`. O modelo de permissões
 * não controla rede nem é sandbox: é uma camada (DEC-066).
 */
export function resolveChildLaunch(
  options: ChildLaunchOptions,
  moduleUrl: string = import.meta.url,
): ChildLaunch {
  const here = path.dirname(fileURLToPath(moduleUrl));
  const layout = moduleUrl.endsWith('.ts') ? sourceLayout(here) : compiledLayout(here);
  const entry = options.entryFile ?? layout.entry;
  const reads = [...readAllowList(layout), entry];
  const typescript = layout.sourceMode ? ['--experimental-transform-types', '--no-warnings'] : [];
  return {
    pdfjsDir: pdfjsDirectory(layout.packagesDir),
    args: [
      '--permission',
      ...reads.map((p) => `--allow-fs-read=${p}`),
      `--max-old-space-size=${options.maxOldGenerationSizeMb}`,
      '--max-semi-space-size=16',
      ...typescript,
      ...layout.preload.flatMap((p) => ['--import', pathToFileURL(p).href]),
      entry,
    ],
  };
}
