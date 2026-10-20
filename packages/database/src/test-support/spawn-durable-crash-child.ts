import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DISPOSABLE_DB_URL_ENV } from './disposable-test-database.js';

const CHILD_SCRIPT = join(import.meta.dirname, 'durable-crash-child.ts');
const LOADER = pathToFileURL(join(import.meta.dirname, 'typescript-source-loader.mjs')).href;
const live = new Set<ChildProcess>();

export interface ChildRun {
  readonly lines: Record<string, unknown>[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}

function parseLines(raw: string): Record<string, unknown>[] {
  return raw
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Inicia um processo Node REAL e independente, conectado ao mesmo PostgreSQL local. */
export function runDurableCrashChild(
  args: Record<string, unknown>,
  databaseUrl: string,
): Promise<ChildRun> {
  const child = spawn(
    process.execPath,
    [
      '--experimental-transform-types',
      '--no-warnings',
      '--import',
      LOADER,
      CHILD_SCRIPT,
      JSON.stringify(args),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, [DISPOSABLE_DB_URL_ENV]: databaseUrl },
    },
  );
  live.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (exitCode, signal) => {
      live.delete(child);
      resolve({ lines: parseLines(stdout), exitCode, signal, stderr });
    });
  });
}

/** Garante zero processos-filho órfãos ao final da suíte. */
export function killLiveCrashChildren(): void {
  for (const child of live) child.kill('SIGKILL');
  live.clear();
}
