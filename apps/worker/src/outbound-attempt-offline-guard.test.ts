import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKER_DIR = import.meta.dirname;
const TELEPHONY_DIR = join(
  WORKER_DIR,
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'src',
  'telephony',
);

const WORKER_FILES = [
  'in-memory-telephony-origination-port.ts',
  'in-memory-outbound-attempt-store.ts',
  'outbound-attempt-event-factory.ts',
  'outbound-attempt-event-mapping.ts',
  'outbound-attempt-coordinator-types.ts',
  'outbound-attempt-origination-coordinator.ts',
];

const FORBIDDEN: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /node:(net|http|https|http2|dgram|tls|child_process)/,
  /\bWebSocket\b/,
  /process\.env/,
  /twilio/i,
  /millis/i,
  /@voice-agent\/(integrations|database)/,
];

function sourcesUnderGuard(): Array<{ name: string; text: string }> {
  const contractFiles = readdirSync(TELEPHONY_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({
      name: `contracts/telephony/${f}`,
      text: readFileSync(join(TELEPHONY_DIR, f), 'utf8'),
    }));
  const workerFiles = WORKER_FILES.map((f) => ({
    name: `worker/${f}`,
    text: readFileSync(join(WORKER_DIR, f), 'utf8'),
  }));
  return [...contractFiles, ...workerFiles];
}

describe('008-OF1 stays offline and provider-neutral', () => {
  it('guards a non-trivial set of files', () => {
    expect(sourcesUnderGuard().length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN.map((pattern) => [String(pattern), pattern] as const))(
    'no guarded source matches %s',
    (_label, pattern) => {
      const offenders = sourcesUnderGuard()
        .filter(({ text }) => pattern.test(text))
        .map(({ name }) => name);
      expect(offenders).toEqual([]);
    },
  );
});
