import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATOMIC_QUESTION_SET_SHA256,
  buildJevAtomicPayload,
  buildJevChoicePayload,
  JEV_QUESTION_SHA256,
  JEV_ROUTING_ATOMIC_DEFINITION,
  JEV_ROUTING_QUESTION_DEFINITION,
} from '../../../../scripts/benchmarks/voice/jev-calibration-question-set.js';
import { FROZEN_DATASET_SHA256 } from '../../../../scripts/benchmarks/voice/baseline-types.js';

interface RawV2Case {
  readonly caseId: string;
  readonly split: 'CALIBRATION' | 'HOLDOUT';
  readonly expectedRoutingClass:
    'DETERMINISTIC_CANDIDATE' | 'GENERATIVE_REQUIRED' | 'SECURITY_ESCALATE';
  readonly subtype: string;
  readonly syntheticCallerInput: string;
  readonly evaluationNote?: string;
}

interface RawV2Dataset {
  readonly version: string;
  readonly cases: readonly RawV2Case[];
}

describe('Jev Calibration Dataset v2 & Frozen Holdout Design Tests', () => {
  const v1Path = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');
  const v2Path = resolve('scripts/benchmarks/voice/jev-calibration-v2-cases.json');
  const EXPECTED_V2_SHA256 = '3e7e0a20ecd3341c99b84d40162b10eff17ba0600d191dd143bc99f00aec3047';

  it('validates v1 dataset remains unchanged and immutable', () => {
    const content = readFileSync(v1Path, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    expect(hash).toBe(FROZEN_DATASET_SHA256);
  });

  it('validates v2 dataset SHA-256 integrity and exactly 120 cases', () => {
    const content = readFileSync(v2Path, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    expect(hash).toBe(EXPECTED_V2_SHA256);

    const dataset = JSON.parse(content) as RawV2Dataset;
    expect(dataset.version).toBe('2.0.0');
    expect(dataset.cases).toHaveLength(120);
  });

  it('verifies exact class distribution: 40 Det / 60 Gen / 20 Sec', () => {
    const dataset = JSON.parse(readFileSync(v2Path, 'utf8')) as RawV2Dataset;
    const det = dataset.cases.filter((c) => c.expectedRoutingClass === 'DETERMINISTIC_CANDIDATE');
    const gen = dataset.cases.filter((c) => c.expectedRoutingClass === 'GENERATIVE_REQUIRED');
    const sec = dataset.cases.filter((c) => c.expectedRoutingClass === 'SECURITY_ESCALATE');

    expect(det).toHaveLength(40);
    expect(gen).toHaveLength(60);
    expect(sec).toHaveLength(20);
  });

  it('verifies exact 80/40 calibration/holdout split and per-split strata', () => {
    const dataset = JSON.parse(readFileSync(v2Path, 'utf8')) as RawV2Dataset;
    const calib = dataset.cases.filter((c) => c.split === 'CALIBRATION');
    const hold = dataset.cases.filter((c) => c.split === 'HOLDOUT');

    expect(calib).toHaveLength(80);
    expect(hold).toHaveLength(40);

    expect(calib.filter((c) => c.expectedRoutingClass === 'DETERMINISTIC_CANDIDATE')).toHaveLength(
      28,
    );
    expect(calib.filter((c) => c.expectedRoutingClass === 'GENERATIVE_REQUIRED')).toHaveLength(40);
    expect(calib.filter((c) => c.expectedRoutingClass === 'SECURITY_ESCALATE')).toHaveLength(12);

    expect(hold.filter((c) => c.expectedRoutingClass === 'DETERMINISTIC_CANDIDATE')).toHaveLength(
      12,
    );
    expect(hold.filter((c) => c.expectedRoutingClass === 'GENERATIVE_REQUIRED')).toHaveLength(20);
    expect(hold.filter((c) => c.expectedRoutingClass === 'SECURITY_ESCALATE')).toHaveLength(8);
  });

  it('verifies unique caseIds, zero overlap, non-empty inputs and absence of PII markers', () => {
    const dataset = JSON.parse(readFileSync(v2Path, 'utf8')) as RawV2Dataset;
    const ids = new Set<string>();
    const calibIds = new Set<string>();
    const holdIds = new Set<string>();

    for (const c of dataset.cases) {
      expect(ids.has(c.caseId)).toBe(false);
      ids.add(c.caseId);

      if (c.split === 'CALIBRATION') calibIds.add(c.caseId);
      if (c.split === 'HOLDOUT') holdIds.add(c.caseId);

      expect(c.syntheticCallerInput.trim().length).toBeGreaterThan(3);
      // Ensure synthetic confidentiality: no live CPF/CNPJ or real email domains
      expect(c.syntheticCallerInput).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(c.syntheticCallerInput).not.toMatch(/\b[A-Za-z0-9._%+-]+@company\.com\b/);
    }

    for (const id of calibIds) {
      expect(holdIds.has(id)).toBe(false);
    }
  });

  it('proves question hash stability for Choice V1 and Atomic V1', () => {
    const choiceJson = JSON.stringify(JEV_ROUTING_QUESTION_DEFINITION);
    const choiceHash = createHash('sha256').update(Buffer.from(choiceJson, 'utf8')).digest('hex');
    expect(choiceHash).toBe(JEV_QUESTION_SHA256);

    const atomicJson = JSON.stringify(JEV_ROUTING_ATOMIC_DEFINITION);
    const atomicHash = createHash('sha256').update(Buffer.from(atomicJson, 'utf8')).digest('hex');
    expect(atomicHash).toBe(ATOMIC_QUESTION_SET_SHA256);
  });

  it('proves anti-leakage in Choice and Atomic payload builders', () => {
    const dataset = JSON.parse(readFileSync(v2Path, 'utf8')) as RawV2Dataset;
    const sample = dataset.cases[0]!;

    const choicePayload = buildJevChoicePayload(sample.syntheticCallerInput);
    const atomicPayload = buildJevAtomicPayload(sample.syntheticCallerInput);

    for (const payload of [choicePayload, atomicPayload]) {
      const stateJson = JSON.stringify(payload.state);
      expect(stateJson).not.toContain(sample.expectedRoutingClass);
      expect(stateJson).not.toContain(sample.split);
      expect(stateJson).not.toContain(sample.subtype);
      expect(stateJson).not.toContain(sample.caseId);
      expect(Object.keys(payload.state)).toEqual(['callerInput', 'language', 'channel']);
    }
  });
});
