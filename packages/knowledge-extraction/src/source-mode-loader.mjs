// Somente para execução a partir do CÓDIGO-FONTE (testes): o processo filho de
// extração roda com o Node nativo (`--experimental-transform-types`) e precisa
// resolver imports `.js` para os arquivos `.ts` do repositório. A API
// compilada usa `extraction-child-entry.js` e nunca carrega este arquivo.
// Ganchos SÍNCRONOS (`registerHooks`, na própria thread): `module.register`
// usaria uma thread interna, negada pelo `--permission` sem `--allow-worker`.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/** `./arquivo.js` inexistente ⇒ tenta `./arquivo.ts` (apenas arquivos locais). */
function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.endsWith('.js') || !context.parentURL) throw error;
    const candidate = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
    if (candidate.protocol !== 'file:' || !existsSync(fileURLToPath(candidate))) throw error;
    return nextResolve(candidate.href, context);
  }
}

registerHooks({ resolve });
