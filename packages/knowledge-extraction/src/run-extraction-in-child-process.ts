import { spawn, type ChildProcess } from 'node:child_process';
import { setPriority } from 'node:os';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
  type KnowledgeUploadErrorCode,
  type KnowledgeUploadFormat,
} from '@voice-agent/contracts';
import { KnowledgeExtractionError } from './extraction-error.js';
import { resolveChildLaunch, type ChildLaunch } from './child-launch.js';
import { watchExtractionChild } from './watch-extraction-child.js';
import type { ExtractionJobHeader, ExtractionSuccess } from './extraction-job.js';
// Referência só de tipo: garante que o `tsc` da API emita o arquivo de entrada do filho no dist.
import type {} from './extraction-child-entry.js';

export interface ExtractionProcessLimits {
  readonly timeoutMs: number;
  readonly maxOldGenerationSizeMb: number;
  /** Melhor esforço (medido entre páginas e, no Linux, pelo pai) — não é limite rígido. */
  readonly maxRssMb: number;
  readonly maxOutputBytes: number;
  readonly maxConcurrent: number;
}

export interface ExtractionProcessRunnerOptions {
  readonly limits?: ExtractionProcessLimits | undefined;
  /** Só testes: entrada de falha induzida, com as MESMAS restrições do filho real. */
  readonly entryFile?: string | undefined;
}

export interface ExtractionRequest {
  readonly format: KnowledgeUploadFormat;
  readonly bytes: Uint8Array;
  /** Requisição cancelada (cliente desconectou) ⇒ o filho é morto. */
  readonly signal?: AbortSignal | undefined;
}

const KNOWN_CODES = new Set<string>(Object.values(CODES));
/** Filhos vivos: mortos se a API encerrar (sem processos órfãos). */
const liveChildren = new Set<ChildProcess>();
process.once('exit', () => liveChildren.forEach((child) => child.kill('SIGKILL')));

/**
 * Extração em PROCESSO FILHO (DEC-066, todos os formatos): `--permission`,
 * heap limitado, ambiente vazio, prioridade baixa, prazo com SIGKILL, saída
 * limitada, no máximo `maxConcurrent` simultâneas (excedente ⇒ BUSY).
 */
export class ExtractionProcessRunner {
  private active = 0;
  private readonly limits: ExtractionProcessLimits;
  private readonly launch: ChildLaunch;

  constructor(options: ExtractionProcessRunnerOptions = {}) {
    this.limits = options.limits ?? KNOWLEDGE_UPLOAD_LIMITS.process;
    this.launch = resolveChildLaunch({
      maxOldGenerationSizeMb: this.limits.maxOldGenerationSizeMb,
      entryFile: options.entryFile,
    });
  }

  async run(request: ExtractionRequest): Promise<ExtractionSuccess> {
    if (this.active >= this.limits.maxConcurrent) throw new KnowledgeExtractionError(CODES.BUSY);
    this.active += 1;
    try {
      const reply = await this.spawnAndWatch(request);
      if (reply.ok) return { text: reply.text, pdf: reply.pdf };
      const code = KNOWN_CODES.has(reply.code) ? reply.code : CODES.MALFORMED_FILE;
      throw new KnowledgeExtractionError(code as KnowledgeUploadErrorCode);
    } finally {
      this.active -= 1;
    }
  }

  private spawnAndWatch(request: ExtractionRequest) {
    const child = spawn(process.execPath, [...this.launch.args], {
      env: {},
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    liveChildren.add(child);
    child.once('close', () => liveChildren.delete(child));
    lowerPriority(child.pid);
    const watched = watchExtractionChild(child, this.limits, request.signal);
    this.sendJob(child, request);
    return watched;
  }

  private sendJob(child: ChildProcess, request: ExtractionRequest): void {
    const header: ExtractionJobHeader = {
      format: request.format,
      length: request.bytes.length,
      pdfjsDir: this.launch.pdfjsDir,
      deadlineMs: this.limits.timeoutMs + 2000,
      maxRssMb: this.limits.maxRssMb,
    };
    child.stdin?.on('error', () => undefined); // filho já encerrado: o vigia decide
    child.stdin?.write(`${JSON.stringify(header)}\n`);
    child.stdin?.end(request.bytes);
  }
}

function lowerPriority(pid: number | undefined): void {
  try {
    if (pid) setPriority(pid, 10);
  } catch {
    // Sem permissão para mudar prioridade: segue com a padrão.
  }
}
