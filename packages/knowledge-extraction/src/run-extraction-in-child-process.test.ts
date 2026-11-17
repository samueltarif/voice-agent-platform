import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_UPLOAD_ERROR_CODES as CODES,
  KNOWLEDGE_UPLOAD_LIMITS,
} from '@voice-agent/contracts';
import {
  ExtractionProcessRunner,
  type ExtractionProcessLimits,
} from './run-extraction-in-child-process.js';
import { resolveChildLaunch } from './child-launch.js';
import { buildDocx, documentXml, paragraph } from './test-support/build-docx-fixture.js';
import { buildPdf } from './test-support/build-pdf-fixture.js';

// `fileURLToPath` (não `.pathname`): caminho válido também no Windows.
const fixture = (name: string) => fileURLToPath(new URL(`./test-support/${name}`, import.meta.url));
const limits = KNOWLEDGE_UPLOAD_LIMITS.process;
const A = new Uint8Array([0x61]);
const runnerWith = (entry: string, overrides: Partial<ExtractionProcessLimits> = {}) =>
  new ExtractionProcessRunner({ entryFile: fixture(entry), limits: { ...limits, ...overrides } });

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
  return 'NO_ERROR';
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('ExtractionProcessRunner — real restricted child process', () => {
  it('extracts TXT, DOCX and PDF in the child', async () => {
    const runner = new ExtractionProcessRunner();
    expect(await runner.run({ format: 'TXT', bytes: new TextEncoder().encode('linha 1') })).toEqual(
      {
        text: 'linha 1',
        pdf: undefined,
      },
    );
    const docx = buildDocx({ document: documentXml(paragraph('Transmissor QT-310')) });
    expect((await runner.run({ format: 'DOCX', bytes: docx })).text).toBe('Transmissor QT-310\n');
    const pages = [['Transmissor QT-310'], ['Transmissor QT-520']];
    const pdf = await runner.run({ format: 'PDF', bytes: buildPdf({ pages }) });
    expect(pdf).toEqual({
      text: 'Transmissor QT-310\n\nTransmissor QT-520',
      pdf: { pages: 2, pagesWithoutText: 0 },
    });
  }, 60_000);

  it('the child cannot read outside its list, write, spawn, start workers or load addons', async () => {
    const result = await runnerWith('permission-probe-child.mjs').run({ format: 'TXT', bytes: A });
    expect(JSON.parse(result.text)).toEqual({
      readOutside: 'ERR_ACCESS_DENIED',
      write: 'ERR_ACCESS_DENIED',
      spawn: 'ERR_ACCESS_DENIED',
      worker: 'ERR_ACCESS_DENIED',
      // Sem `--allow-addons`, o Node desativa addons nativos por completo.
      addon: 'ERR_DLOPEN_DISABLED',
    });
  }, 30_000);
});

describe('ExtractionProcessRunner — termination and limits (no orphans)', () => {
  it('kills a child that exceeds the time limit (TIMEOUT)', async () => {
    const runner = runnerWith('hanging-child.mjs', { timeoutMs: 1500 });
    const started = Date.now();
    expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.TIMEOUT);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it('a child that exhausts its heap becomes RESOURCE_LIMIT', async () => {
    const runner = runnerWith('heap-hog-child.mjs', { maxOldGenerationSizeMb: 32 });
    expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.RESOURCE_LIMIT);
  }, 60_000);

  it.runIf(process.platform === 'linux')(
    'Linux: memory outside the heap above maxRssMb is stopped by the parent (best effort)',
    async () => {
      const runner = runnerWith('rss-hog-child.mjs', { maxRssMb: 200 });
      expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.RESOURCE_LIMIT);
    },
    30_000,
  );

  it('output above the limit is cut and refused', async () => {
    const runner = runnerWith('output-flood-child.mjs', { maxOutputBytes: 256 * 1024 });
    expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.RESOURCE_LIMIT);
  }, 30_000);

  it('an unexpected exit is an internal error that never carries stderr content', async () => {
    const message = await codeOf(
      runnerWith('silent-exit-child.mjs').run({ format: 'TXT', bytes: A }),
    );
    expect(message).toBe('Extraction process failed');
    expect(message).not.toContain('Sigiloso');
  }, 30_000);

  it('refuses beyond the concurrency limit (BUSY) and frees the slot', async () => {
    const runner = runnerWith('hanging-child.mjs', { timeoutMs: 1500, maxConcurrent: 1 });
    const first = codeOf(runner.run({ format: 'TXT', bytes: A }));
    expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.BUSY);
    expect(await first).toBe(CODES.TIMEOUT);
    expect(await codeOf(runner.run({ format: 'TXT', bytes: A }))).toBe(CODES.TIMEOUT);
  }, 30_000);

  it('a cancelled request kills the child immediately', async () => {
    const controller = new AbortController();
    const runner = runnerWith('stalling-child.mjs');
    const pending = codeOf(runner.run({ format: 'TXT', bytes: A, signal: controller.signal }));
    setTimeout(() => controller.abort(), 500);
    const started = Date.now();
    expect(await pending).toBe('Extraction cancelled');
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 30_000);

  it('if the parent dies, the child exits by itself (IPC closed) — no orphan', async () => {
    const { args } = resolveChildLaunch({
      maxOldGenerationSizeMb: 64,
      entryFile: fixture('stalling-child.mjs'),
    });
    const parent = spawn(process.execPath, [fixture('orphan-parent.mjs'), JSON.stringify(args)]);
    const { pid } = await new Promise<{ pid: number }>((resolve) =>
      parent.stdout.once('data', (chunk: Buffer) => resolve(JSON.parse(chunk.toString()))),
    );
    expect(isAlive(pid)).toBe(true);
    parent.kill('SIGKILL');
    const deadline = Date.now() + 10_000;
    while (isAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    expect(isAlive(pid)).toBe(false);
  }, 30_000);
});
