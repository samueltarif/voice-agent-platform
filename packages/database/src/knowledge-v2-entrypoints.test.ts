import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * B2a (DEC-071) — caminhos de contorno da B2b fechados por guarda de código.
 * A busca v2 detalhada (com trechos brutos e suspeitos) só é chamada pela
 * comparação administrativa e pelo serviço de projeção; nenhum código de
 * produção fora de `packages/database` pede `retrievalProfile: 'v2'` à busca
 * tradicional (`retrieve`), que devolve trechos brutos.
 */
// `fileURLToPath` produz caminho válido também no Windows (sem `D:\D:\...`).
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
/** Caminho relativo sempre com `/`, para as comparações valerem no Windows. */
const toPosix = (path: string) => path.split(sep).join('/');

function productionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test-support')
      return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return productionSources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const sources = ['apps', 'packages'].flatMap((top) =>
  readdirSync(join(ROOT, top), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      try {
        return productionSources(join(ROOT, top, d.name, 'src'));
      } catch {
        return [];
      }
    })
    .map((file) => ({ file: toPosix(relative(ROOT, file)), text: readFileSync(file, 'utf8') })),
);

describe('pontos de entrada da busca v2 (B2a)', () => {
  it('encontra o código de produção', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('só a comparação administrativa e a projeção chamam a v2 detalhada', () => {
    const callers = sources
      .filter((s) => /retrieveKnowledgeV2Detailed\(/.test(s.text))
      .map((s) => s.file)
      .sort();
    expect(callers).toEqual([
      'packages/database/src/repositories/knowledge-agent-projection-service.ts',
      'packages/database/src/repositories/knowledge-retrieval-comparison.ts',
      'packages/database/src/repositories/knowledge-retrieval-v2.ts',
    ]);
  });

  it("nenhum código fora de packages/database pede retrievalProfile 'v2' à busca tradicional", () => {
    const outside = sources.filter(
      (s) => !s.file.startsWith('packages/database/') && !s.file.startsWith('packages/contracts/'),
    );
    const asksV2 = /\.retrieve\(\s*\{[^;]*retrievalProfile/s;
    expect(outside.filter((s) => asksV2.test(s.text)).map((s) => s.file)).toEqual([]);
    // O ramo v2 da ferramenta nem chama a busca tradicional.
    const v2Tool = sources.find((s) =>
      s.file.endsWith('agent-tools/src/knowledge-search-tool-v2.ts'),
    )!;
    expect(v2Tool.text).not.toMatch(/\.retrieve\(/);
    expect(outside.filter((s) => /retrieveKnowledgeV2\b/.test(s.text)).map((s) => s.file)).toEqual(
      [],
    );
  });
});
