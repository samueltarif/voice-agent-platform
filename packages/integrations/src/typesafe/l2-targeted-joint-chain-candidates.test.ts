import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesOperatingHoursCapability } from '../../../../apps/voice/src/operating-hours-capability-matcher.js';

const datasetPath = resolve(
  'scripts/benchmarks/voice/jev-openai-l2-joint-chain-targeted-v1-cases.json',
);

const l2v1Path = resolve(
  'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
);

describe('L2 Targeted Joint-Chain Candidates (Slice 006BB)', () => {
  it('dataset is versioned separately from L2 v1 with 4 synthetic cases', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.suite).toBe('phase-6-l2-joint-chain-targeted');
    expect(parsed.cases).toHaveLength(4);
    expect(parsed.totalCases).toBe(4);
    expect(parsed.governance.syntheticOnly).toBe(true);
    expect(parsed.governance.holdoutData).toBe(0);
    expect(parsed.governance.customerData).toBe(0);
  });

  it('every candidate matches offline and is disjoint from L2 v1 utterances', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    const l2v1 = JSON.parse(readFileSync(l2v1Path, 'utf8'));
    const l2v1Utterances = new Set(
      l2v1.cases.map((c: { syntheticCallerUtterance: string }) => c.syntheticCallerUtterance),
    );
    const seen = new Set<string>();

    for (const c of parsed.cases as Array<{
      caseId: string;
      syntheticCallerUtterance: string;
      expectedMatcherResult: boolean;
    }>) {
      expect(c.expectedMatcherResult).toBe(true);
      expect(typeof c.syntheticCallerUtterance).toBe('string');
      expect(c.syntheticCallerUtterance.length).toBeGreaterThan(0);
      expect(c.syntheticCallerUtterance.length).toBeLessThanOrEqual(1000);
      expect(matchesOperatingHoursCapability(c.syntheticCallerUtterance)).toBe(true);
      expect(l2v1Utterances.has(c.syntheticCallerUtterance)).toBe(false);
      expect(seen.has(c.caseId)).toBe(false);
      seen.add(c.caseId);
    }
  });
});
