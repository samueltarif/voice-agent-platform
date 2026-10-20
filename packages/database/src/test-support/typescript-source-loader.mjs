// Carregador de TESTE para processos-filho: permite executar o código-fonte
// TypeScript do repositório (imports `.js` → `.ts`) com o Node nativo, sem
// dependências novas e sem artefatos de build. Uso exclusivo em testes offline.
import { register } from 'node:module';

register('./typescript-source-resolve-hooks.mjs', import.meta.url);
