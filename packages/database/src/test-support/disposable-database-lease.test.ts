import { describe, expect, it } from 'vitest';
import { releaseDisposableDatabaseLease } from './disposable-database-lease.js';

describe('disposable database lease bookkeeping', () => {
  it('fails loudly when releasing a lease this process does not hold', async () => {
    await expect(releaseDisposableDatabaseLease()).rejects.toThrow(/not held/);
  });
});
