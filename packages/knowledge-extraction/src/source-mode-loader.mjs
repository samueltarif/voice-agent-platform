// Somente para execução a partir do CÓDIGO-FONTE (testes): o worker de
// extração roda com o Node nativo (`--experimental-transform-types`) e precisa
// resolver imports `.js` para os arquivos `.ts` do repositório. A API
// compilada usa `extraction-worker.js` e nunca carrega este arquivo.
import { register } from 'node:module';

register('./source-mode-resolve-hooks.mjs', import.meta.url);
