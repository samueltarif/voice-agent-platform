import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesOperatingHoursCapability } from '../../../../apps/voice/src/operating-hours-capability-matcher.js';
import { resolveOperatingHoursInvolvement } from '../../../../apps/voice/src/operating-hours-involvement.js';

const datasetPath = resolve(
  'scripts/benchmarks/voice/jev-openai-l2-joint-chain-mixed-intent-v2-cases.json',
);

const l2v1Path = resolve(
  'scripts/benchmarks/voice/jev-openai-l2-synthetic-integration-v1-cases.json',
);

interface V2Case {
  id: string;
  description: string;
  callerTranscript: string;
  expectedMatcherMatched: boolean;
  expectedCapabilityRelevant: boolean;
  expectedExactlyAnswerable: boolean;
  expectedResidualSemanticWork: boolean;
  expectedJevOutcome?: string;
}

describe('L2 Mixed-Intent v2 Dataset Contract (Slice 006BF)', () => {
  it('dataset carries versioned v2 identity with exactly 4 synthetic cases', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.suite).toBe('phase-6-l2-joint-chain-mixed-intent');
    expect(parsed.cases).toHaveLength(4);
    expect(parsed.totalCases).toBe(4);
    expect(parsed.governance.syntheticOnly).toBe(true);
    expect(parsed.governance.holdoutData).toBe(0);
    expect(parsed.governance.customerData).toBe(0);
  });

  it('every v2 case satisfies the mixed-intent offline contract', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    const cases = parsed.cases as V2Case[];
    for (const c of cases) {
      expect(c.expectedMatcherMatched).toBe(false);
      expect(c.expectedCapabilityRelevant).toBe(true);
      expect(c.expectedExactlyAnswerable).toBe(false);
      expect(c.expectedResidualSemanticWork).toBe(true);
      expect(typeof c.callerTranscript).toBe('string');
      expect(c.callerTranscript.length).toBeGreaterThan(0);
      expect(matchesOperatingHoursCapability(c.callerTranscript)).toBe(false);
      const involvement = resolveOperatingHoursInvolvement(c.callerTranscript);
      expect(involvement.relevant).toBe(true);
      expect(involvement.exactlyAnswerable).toBe(false);
    }
  });

  it('case ids are unique and transcripts are non-empty, distinct and disjoint from L2 v1', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    const l2v1 = JSON.parse(readFileSync(l2v1Path, 'utf8'));
    const l2v1Utterances = new Set(
      l2v1.cases.map((c: { syntheticCallerUtterance: string }) => c.syntheticCallerUtterance),
    );
    const seenIds = new Set<string>();
    const seenTranscripts = new Set<string>();
    for (const c of parsed.cases as V2Case[]) {
      expect(seenIds.has(c.id)).toBe(false);
      seenIds.add(c.id);
      expect(seenTranscripts.has(c.callerTranscript)).toBe(false);
      seenTranscripts.add(c.callerTranscript);
      expect(l2v1Utterances.has(c.callerTranscript)).toBe(false);
    }
  });

  it('dataset never encodes a guaranteed Jev policy outcome as ground truth', () => {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('GENERATIVE_REQUIRED');
    expect(serialized).not.toContain('DETERMINISTIC_CANDIDATE');
    expect(serialized).not.toContain('SECURITY_ESCALATE');
    for (const c of parsed.cases as V2Case[]) {
      if (c.expectedJevOutcome !== undefined) {
        expect(['NOT_OBSERVED', 'STUDY_TARGET', 'NOT_OBSERVED_STUDY_TARGET']).toContain(
          c.expectedJevOutcome,
        );
      }
    }
  });
});
