import { Worker } from 'node:worker_threads';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeUploadErrorCode,
  type KnowledgeUploadFormat,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import type { ExtractionWorkerReply } from './extraction-worker.js';
import { resolveWorkerEntry, type WorkerEntry } from './resolve-worker-entry.js';

export interface ExtractionWorkerLimits {
  readonly timeoutMs: number;
  readonly maxOldGenerationSizeMb: number;
  readonly maxConcurrent: number;
}

export interface ExtractionWorkerRunnerOptions {
  readonly limits?: ExtractionWorkerLimits | undefined;
  /** Só testes: substitui o worker por um de falha induzida (tempo, memória, rede). */
  readonly entry?: WorkerEntry | undefined;
}

const KNOWN_CODES = new Set<string>(Object.values(CODES));

function toError(reply: ExtractionWorkerReply): KnowledgeExtractionError | null {
  if (reply.ok) return null;
  const code = KNOWN_CODES.has(reply.code) ? reply.code : CODES.MALFORMED_FILE;
  return new KnowledgeExtractionError(code as KnowledgeUploadErrorCode);
}

/**
 * Extração em `worker_threads` (D-A2). NÃO é isolamento de processo: o worker
 * compartilha o processo da API. Mitigações: no máximo `maxConcurrent`
 * extrações simultâneas (excedente ⇒ BUSY), prazo com `terminate()` (TIMEOUT),
 * teto do heap V8 via `resourceLimits` (RESOURCE_LIMIT) — melhor esforço:
 * memória fora do heap (buffers) não é coberta —, ambiente vazio e rede
 * bloqueada dentro do worker. A saída padrão do worker é descartada.
 */
export class ExtractionWorkerRunner {
  private active = 0;
  private readonly limits: ExtractionWorkerLimits;
  private readonly entry: WorkerEntry;

  constructor(options: ExtractionWorkerRunnerOptions = {}) {
    this.limits = options.limits ?? KNOWLEDGE_UPLOAD_LIMITS.worker;
    this.entry = options.entry ?? resolveWorkerEntry();
  }

  async run(format: KnowledgeUploadFormat, bytes: Uint8Array): Promise<string> {
    if (this.active >= this.limits.maxConcurrent) {
      throw new KnowledgeExtractionError(CODES.BUSY);
    }
    this.active += 1;
    try {
      const reply = await this.spawn(format, bytes);
      const error = toError(reply);
      if (error) throw error;
      return (reply as { text: string }).text;
    } finally {
      this.active -= 1;
    }
  }

  private spawn(format: KnowledgeUploadFormat, bytes: Uint8Array): Promise<ExtractionWorkerReply> {
    const worker = new Worker(this.entry.url, {
      workerData: { format, bytes },
      ...(this.entry.execArgv ? { execArgv: this.entry.execArgv } : {}),
      env: {},
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: this.limits.maxOldGenerationSizeMb },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    return settleWorker(worker, this.limits.timeoutMs);
  }
}

/** Primeiro desfecho vence: resposta, prazo esgotado, falta de memória ou falha. */
function settleWorker(worker: Worker, timeoutMs: number): Promise<ExtractionWorkerReply> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      action();
    };
    const timer = setTimeout(
      () => finish(() => reject(new KnowledgeExtractionError(CODES.TIMEOUT))),
      timeoutMs,
    );
    worker.once('message', (reply: ExtractionWorkerReply) => finish(() => resolve(reply)));
    worker.once('error', (error: Error & { code?: string }) =>
      finish(() => reject(workerFailure(error))),
    );
    worker.once('exit', () =>
      finish(() => reject(new Error('Extraction worker exited without a result'))),
    );
  });
}

/** Falta de memória ⇒ código de recusa; demais falhas ⇒ erro interno (sem conteúdo). */
function workerFailure(error: Error & { code?: string }): Error {
  if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
    return new KnowledgeExtractionError(CODES.RESOURCE_LIMIT);
  }
  return new Error('Extraction worker failed');
}
