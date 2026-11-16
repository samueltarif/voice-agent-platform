/** Como iniciar o worker: arquivo de entrada e flags do Node. */
export interface WorkerEntry {
  readonly url: URL;
  /** `undefined` ⇒ herda as flags do processo (API compilada: `--import ./register-dist.js`). */
  readonly execArgv: string[] | undefined;
}

const SOURCE_MODE_FLAGS = ['--experimental-transform-types', '--no-warnings', '--import'];

/**
 * API compilada (`.js`): o worker é `extraction-worker.js` ao lado deste módulo
 * e herda o resolvedor do `dist`. Código-fonte (`.ts`, testes): o worker roda
 * o `.ts` com o carregador local de fonte.
 */
export function resolveWorkerEntry(moduleUrl: string = import.meta.url): WorkerEntry {
  if (moduleUrl.endsWith('.js')) {
    return { url: new URL('./extraction-worker.js', moduleUrl), execArgv: undefined };
  }
  const loader = new URL('./source-mode-loader.mjs', moduleUrl).href;
  return {
    url: new URL('./extraction-worker.ts', moduleUrl),
    execArgv: [...SOURCE_MODE_FLAGS, loader],
  };
}
