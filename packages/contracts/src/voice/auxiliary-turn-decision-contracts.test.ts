import { describe, expect, it } from 'vitest';
import {
  type AuxiliaryTurnDecisionOutput,
  validateAuxiliaryTurnDecisionOutput,
} from './auxiliary-turn-decision-contracts.js';

describe('AuxiliaryTurnDecisionContracts Validation', () => {
  const validOutput: AuxiliaryTurnDecisionOutput = {
    deterministicScore: 0.85,
    generativeScore: 0.15,
    securityScore: 0.02,
    providerModel: 'typesafe-jev-v1',
    latencyMs: 245,
  };

  it('validates and returns correctly structured output', () => {
    const result = validateAuxiliaryTurnDecisionOutput(validOutput);
    expect(result).toEqual(validOutput);
  });

  it('rejects non-object or null input', () => {
    expect(() => validateAuxiliaryTurnDecisionOutput(null)).toThrow(TypeError);
    expect(() => validateAuxiliaryTurnDecisionOutput('string')).toThrow(TypeError);
    expect(() => validateAuxiliaryTurnDecisionOutput(123)).toThrow(TypeError);
  });

  it('rejects scores outside [0, 1] range', () => {
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, deterministicScore: -0.01 }),
    ).toThrow(TypeError);
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, deterministicScore: 1.01 }),
    ).toThrow(TypeError);
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, generativeScore: 2.0 }),
    ).toThrow(TypeError);
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, securityScore: -1 }),
    ).toThrow(TypeError);
  });

  it('rejects non-finite or NaN scores', () => {
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, deterministicScore: Number.NaN }),
    ).toThrow(TypeError);
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({
        ...validOutput,
        generativeScore: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(TypeError);
  });

  it('rejects missing or empty providerModel', () => {
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, providerModel: '' }),
    ).toThrow(TypeError);
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, providerModel: '   ' }),
    ).toThrow(TypeError);
  });

  it('rejects invalid or negative latencyMs', () => {
    expect(() => validateAuxiliaryTurnDecisionOutput({ ...validOutput, latencyMs: -5 })).toThrow(
      TypeError,
    );
    expect(() =>
      validateAuxiliaryTurnDecisionOutput({ ...validOutput, latencyMs: Number.NaN }),
    ).toThrow(TypeError);
  });

  it('contract type design prevents business authority fields', () => {
    const result = validateAuxiliaryTurnDecisionOutput(validOutput) as unknown as Record<
      string,
      unknown
    >;
    expect(result.responseText).toBeUndefined();
    expect(result.executeTool).toBeUndefined();
    expect(result.handoff).toBeUndefined();
    expect(result.mutateState).toBeUndefined();
    expect(result.organizationMutation).toBeUndefined();
    expect(result.lifecycleAction).toBeUndefined();
  });
});
