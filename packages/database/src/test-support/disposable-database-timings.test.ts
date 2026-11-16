import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  markLeaseAcquired,
  markLeaseReleased,
  registerDisposableSuite,
  timeSuitePhase,
} from './disposable-database-timings.js';
import { summarizeDisposableTimings } from './summarize-disposable-timings.js';

const dir = mkdtempSync(join(tmpdir(), 'of2-timings-test-'));
const file = join(dir, 'timings.jsonl');
const DB = 'of2_test_0123456789ab';

describe('disposable database timings (DEC-063)', () => {
  afterEach(() => {
    delete process.env['OF2_TIMINGS_FILE'];
    rmSync(file, { force: true });
  });

  it('records nothing without OF2_TIMINGS_FILE or with a relative path', async () => {
    registerDisposableSuite(DB, 'suite');
    await timeSuitePhase(DB, 'CREATE', async () => undefined);
    process.env['OF2_TIMINGS_FILE'] = 'relative.jsonl';
    await timeSuitePhase(DB, 'CREATE', async () => undefined);
    expect(existsSync(file)).toBe(false);
    expect(existsSync('relative.jsonl')).toBe(false);
  });

  it('records each phase (also on failure) and the lease hold, without credentials', async () => {
    process.env['OF2_TIMINGS_FILE'] = file;
    registerDisposableSuite(DB, 'suite-a');
    await timeSuitePhase(DB, 'LEASE_WAIT', async () => undefined);
    markLeaseAcquired(DB);
    await expect(
      timeSuitePhase(DB, 'MIGRATE', async () => Promise.reject(new Error('x'))),
    ).rejects.toThrow();
    markLeaseReleased(DB);
    const raw = readFileSync(file, 'utf8');
    const rows = raw
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { phase: string; label: string });
    expect(rows.map((r) => r.phase)).toEqual(['LEASE_WAIT', 'MIGRATE', 'LEASE_HELD']);
    expect(rows.every((r) => r.label === 'suite-a')).toBe(true);
    expect(raw).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('summarizes phases, the slowest suites and unreleased leases', async () => {
    process.env['OF2_TIMINGS_FILE'] = file;
    registerDisposableSuite(DB, 'lenta');
    await timeSuitePhase(DB, 'LEASE_WAIT', async () => undefined);
    markLeaseAcquired(DB);
    markLeaseReleased(DB);
    const summary = summarizeDisposableTimings(file).join('\n');
    expect(summary).toContain('LEASE_WAIT: 1');
    expect(summary).toContain('maiores LEASE_HELD: lenta=');
    expect(summary).toContain('leases obtidos=1 liberados=1');
    expect(summarizeDisposableTimings(join(dir, 'missing.jsonl'))[0]).toContain('nenhum registro');
  });
});
