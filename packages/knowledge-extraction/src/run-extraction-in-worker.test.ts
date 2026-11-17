import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_UPLOAD_ERROR_CODES as CODES } from '@voice-agent/contracts';
import { ExtractionWorkerRunner } from './run-extraction-in-worker.js';
import { resolveWorkerEntry } from './resolve-worker-entry.js';
import { buildDocx, documentXml, paragraph } from './test-support/build-docx-fixture.js';

const fixture = (name: string) => new URL(`./test-support/${name}`, import.meta.url);
const limits = { timeoutMs: 15_000, maxOldGenerationSizeMb: 256, maxConcurrent: 2 };

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
}

describe('ExtractionWorkerRunner (real worker_threads)', () => {
  it('extracts TXT and DOCX inside the worker', async () => {
    const runner = new ExtractionWorkerRunner({ limits });
    expect(await runner.run('TXT', new TextEncoder().encode('linha 1\nlinha 2'))).toBe(
      'linha 1\nlinha 2',
    );
    const docx = buildDocx({ document: documentXml(paragraph('Transmissor QT-310')) });
    expect(await runner.run('DOCX', docx)).toBe('Transmissor QT-310\n');
  }, 30_000);

  it('returns the refusal code from the worker (malicious DOCX)', async () => {
    const runner = new ExtractionWorkerRunner({ limits });
    const xxe = buildDocx({ document: '<!DOCTYPE x>' + documentXml(paragraph('a')) });
    expect(await codeOf(runner.run('DOCX', xxe))).toBe(CODES.UNSAFE_XML);
  }, 30_000);

  it('terminates a worker that exceeds the time limit (TIMEOUT)', async () => {
    const runner = new ExtractionWorkerRunner({
      limits: { ...limits, timeoutMs: 300 },
      entry: { url: fixture('hanging-worker.mjs'), execArgv: [] },
    });
    const started = Date.now();
    expect(await codeOf(runner.run('TXT', new Uint8Array([0x61])))).toBe(CODES.TIMEOUT);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 30_000);

  it('stops a worker that exhausts its heap limit (RESOURCE_LIMIT)', async () => {
    const runner = new ExtractionWorkerRunner({
      limits: { ...limits, maxOldGenerationSizeMb: 32 },
      entry: { url: fixture('memory-hog-worker.mjs'), execArgv: [] },
    });
    expect(await codeOf(runner.run('TXT', new Uint8Array([0x61])))).toBe(CODES.RESOURCE_LIMIT);
  }, 60_000);

  it('refuses extractions beyond the concurrency limit (BUSY) and frees the slot', async () => {
    const runner = new ExtractionWorkerRunner({
      limits: { ...limits, timeoutMs: 500, maxConcurrent: 1 },
      entry: { url: fixture('hanging-worker.mjs'), execArgv: [] },
    });
    const first = codeOf(runner.run('TXT', new Uint8Array([0x61])));
    expect(await codeOf(runner.run('TXT', new Uint8Array([0x61])))).toBe(CODES.BUSY);
    expect(await first).toBe(CODES.TIMEOUT);
    expect(await codeOf(runner.run('TXT', new Uint8Array([0x61])))).toBe(CODES.TIMEOUT);
  }, 30_000);

  it('blocks fetch and socket connections inside the worker', async () => {
    const { execArgv } = resolveWorkerEntry();
    const worker = new Worker(fixture('network-probe-worker.ts'), { execArgv, env: {} });
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    await worker.terminate();
    expect(result).toEqual({ fetchBlocked: true, socketBlocked: true });
  }, 30_000);
});
