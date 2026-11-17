import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  type KnowledgeUploadErrorCode,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import type { ExtractionReply } from './extraction-job.js';

export interface WatchLimits {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly maxRssMb: number;
}

const HEAP_EXHAUSTED = /heap out of memory|Reached heap limit|Array buffer allocation failed/i;
const STDERR_TAIL = 4096;

/** RSS do filho pelo pai (só Linux, `/proc`); outros sistemas: só o filho mede. */
function childRssMb(pid: number | undefined): number {
  if (process.platform !== 'linux' || !pid) return 0;
  try {
    const pages = Number(readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]);
    return (pages * 4096) / (1024 * 1024);
  } catch {
    return 0;
  }
}

function parseReply(stdout: Buffer): ExtractionReply | null {
  try {
    return JSON.parse(stdout.toString('utf8')) as ExtractionReply;
  } catch {
    return null;
  }
}

/** Saída sem resposta válida: memória esgotada ⇒ recusa; resto ⇒ erro interno. */
function abnormalExit(stderrTail: string): Error {
  if (HEAP_EXHAUSTED.test(stderrTail)) return new KnowledgeExtractionError(CODES.RESOURCE_LIMIT);
  return new Error('Extraction process failed');
}

/**
 * Primeiro desfecho vence: resposta, prazo (SIGKILL), saída grande demais,
 * memória (Linux), cancelamento ou falha. Em TODOS os casos o filho é morto
 * se ainda estiver vivo. O `stderr` nunca é registrado nem devolvido.
 */
export function watchExtractionChild(
  child: ChildProcess,
  limits: WatchLimits,
  signal?: AbortSignal,
): Promise<ExtractionReply> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    let outBytes = 0;
    let stderrTail = '';
    const finish = (action: () => void) => {
      clearTimeout(timer);
      clearInterval(rssPoll);
      signal?.removeEventListener('abort', onAbort);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      action();
    };
    const refuse = (code: KnowledgeUploadErrorCode) =>
      finish(() => reject(new KnowledgeExtractionError(code)));
    const onAbort = () => finish(() => reject(new Error('Extraction cancelled')));
    const timer = setTimeout(() => refuse(CODES.TIMEOUT), limits.timeoutMs);
    const rssPoll = setInterval(() => {
      if (childRssMb(child.pid) > limits.maxRssMb) refuse(CODES.RESOURCE_LIMIT);
    }, 100);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    child.stdout?.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > limits.maxOutputBytes) return refuse(CODES.RESOURCE_LIMIT);
      out.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL);
    });
    child.once('error', () => finish(() => reject(new Error('Extraction process failed'))));
    child.once('close', () => {
      const reply = parseReply(Buffer.concat(out));
      finish(() => (reply ? resolve(reply) : reject(abnormalExit(stderrTail))));
    });
  });
}
