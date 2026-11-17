import { KNOWLEDGE_UPLOAD_LIMITS } from '@voice-agent/contracts';
import { installNetworkGuard } from './network-guard.js';
import { readExtractionJob } from './read-extraction-job.js';
import { extractByFormat } from './extract-by-format.js';
import type { ExtractionReply } from './extraction-job.js';

/**
 * Processo filho de extração (DEC-066). Iniciado pelo pai com `--permission`
 * (leitura só do código necessário; sem escrita, processos, workers ou
 * addons), heap limitado e ambiente vazio. Escreve UMA linha JSON e sai.
 */
installNetworkGuard();

const EXIT_DEADLINE = 70;
const maxFileBytes = Math.max(...Object.values(KNOWLEDGE_UPLOAD_LIMITS.maxFileBytes));

function reply(message: ExtractionReply): void {
  process.stdout.write(`${JSON.stringify(message)}\n`, () => process.exit(0));
}

// Pai encerrado (canal IPC fechado) ⇒ o filho não continua sozinho.
process.on('disconnect', () => process.exit(EXIT_DEADLINE));

const job = await readExtractionJob(process.stdin, maxFileBytes);
// Vigia assíncrona: cobre esperas longas mesmo se o pai não matar o processo.
setTimeout(() => process.exit(EXIT_DEADLINE), job.header.deadlineMs).unref();
reply(await extractByFormat(job.header, job.bytes));
