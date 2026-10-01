import { describe, expect, it } from 'vitest';
import {
  FROZEN_POLICY_THRESHOLDS,
  interpretFrozenTurnPolicy,
} from './frozen-policy-interpreter.js';

describe('frozen-policy-interpreter', () => {
  describe('canonical thresholds immutability', () => {
    it('matches exact canonical frozen thresholds', () => {
      expect(FROZEN_POLICY_THRESHOLDS.security).toBe(0.56);
      expect(FROZEN_POLICY_THRESHOLDS.deterministic).toBe(0.35);
      expect(FROZEN_POLICY_THRESHOLDS.generative).toBe(0.47);
    });
  });

  describe('canonical rule evaluations', () => {
    it('classifies as SECURITY_ESCALATE when securityScore reaches threshold', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.8,
        deterministicScore: 0.1,
        generativeScore: 0.5,
      });
      expect(result).toBe('SECURITY_ESCALATE');
    });

    it('classifies as DETERMINISTIC_CANDIDATE when deterministic >= 0.35 and generative <= 0.47', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.1,
        deterministicScore: 0.6,
        generativeScore: 0.3,
      });
      expect(result).toBe('DETERMINISTIC_CANDIDATE');
    });

    it('classifies as GENERATIVE_REQUIRED when generativeScore exceeds 0.47', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.1,
        deterministicScore: 0.6,
        generativeScore: 0.7,
      });
      expect(result).toBe('GENERATIVE_REQUIRED');
    });

    it('classifies as GENERATIVE_REQUIRED when deterministicScore is below 0.35', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.1,
        deterministicScore: 0.2,
        generativeScore: 0.3,
      });
      expect(result).toBe('GENERATIVE_REQUIRED');
    });
  });

  describe('security precedence', () => {
    it('prioritizes SECURITY_ESCALATE even when deterministic conditions are fully met', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.7,
        deterministicScore: 0.9,
        generativeScore: 0.1,
      });
      expect(result).toBe('SECURITY_ESCALATE');
    });

    it('prioritizes SECURITY_ESCALATE at exact triple boundary', () => {
      const result = interpretFrozenTurnPolicy({
        securityScore: 0.56,
        deterministicScore: 0.35,
        generativeScore: 0.47,
      });
      expect(result).toBe('SECURITY_ESCALATE');
    });
  });

  describe('boundary equality and logical neighborhood', () => {
    it('evaluates security boundary equality exactly at 0.56', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.56,
          deterministicScore: 0.1,
          generativeScore: 0.9,
        }),
      ).toBe('SECURITY_ESCALATE');
    });

    it('falls through to remaining rules just below security boundary', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.5599,
          deterministicScore: 0.35,
          generativeScore: 0.47,
        }),
      ).toBe('DETERMINISTIC_CANDIDATE');

      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.5599,
          deterministicScore: 0.2,
          generativeScore: 0.8,
        }),
      ).toBe('GENERATIVE_REQUIRED');
    });

    it('evaluates deterministic and generative exact boundaries at 0.35 and 0.47', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: 0.35,
          generativeScore: 0.47,
        }),
      ).toBe('DETERMINISTIC_CANDIDATE');
    });

    it('requires deterministic >= 0.35 (just below fails)', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: 0.3499,
          generativeScore: 0.47,
        }),
      ).toBe('GENERATIVE_REQUIRED');
    });

    it('requires generative <= 0.47 (just above fails)', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: 0.35,
          generativeScore: 0.4701,
        }),
      ).toBe('GENERATIVE_REQUIRED');
    });

    it('handles extreme valid domain boundaries [0, 1]', () => {
      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.0,
          deterministicScore: 1.0,
          generativeScore: 0.0,
        }),
      ).toBe('DETERMINISTIC_CANDIDATE');

      expect(
        interpretFrozenTurnPolicy({
          securityScore: 0.0,
          deterministicScore: 0.0,
          generativeScore: 0.0,
        }),
      ).toBe('GENERATIVE_REQUIRED');
    });
  });

  describe('score domain and input validation', () => {
    it('throws RangeError for NaN scores', () => {
      expect(() =>
        interpretFrozenTurnPolicy({
          securityScore: NaN,
          deterministicScore: 0.5,
          generativeScore: 0.5,
        }),
      ).toThrow(RangeError);
    });

    it('throws RangeError for negative scores', () => {
      expect(() =>
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: -0.01,
          generativeScore: 0.5,
        }),
      ).toThrow(RangeError);
    });

    it('throws RangeError for scores strictly greater than 1', () => {
      expect(() =>
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: 0.5,
          generativeScore: 1.0001,
        }),
      ).toThrow(RangeError);
    });

    it('throws RangeError for non-finite scores (Infinity and -Infinity)', () => {
      expect(() =>
        interpretFrozenTurnPolicy({
          securityScore: Infinity,
          deterministicScore: 0.5,
          generativeScore: 0.5,
        }),
      ).toThrow(RangeError);

      expect(() =>
        interpretFrozenTurnPolicy({
          securityScore: 0.1,
          deterministicScore: -Infinity,
          generativeScore: 0.5,
        }),
      ).toThrow(RangeError);
    });

    it('throws TypeError for non-number score types', () => {
      expect(() =>
        interpretFrozenTurnPolicy({
          // @ts-expect-error test runtime validation
          securityScore: '0.8',
          deterministicScore: 0.5,
          generativeScore: 0.5,
        }),
      ).toThrow(TypeError);
    });

    it('throws TypeError for non-object or null input', () => {
      // @ts-expect-error test runtime validation
      expect(() => interpretFrozenTurnPolicy(null)).toThrow(TypeError);
      // @ts-expect-error test runtime validation
      expect(() => interpretFrozenTurnPolicy(undefined)).toThrow(TypeError);
    });
  });

  describe('purity and determinism', () => {
    it('produces identical results across repeated identical invocations', () => {
      const input = {
        securityScore: 0.12,
        deterministicScore: 0.44,
        generativeScore: 0.38,
      };
      const r1 = interpretFrozenTurnPolicy(input);
      const r2 = interpretFrozenTurnPolicy(input);
      expect(r1).toBe('DETERMINISTIC_CANDIDATE');
      expect(r1).toBe(r2);
    });
  });
});
