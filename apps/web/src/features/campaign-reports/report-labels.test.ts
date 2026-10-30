import { describe, it, expect } from 'vitest';
import { ATTEMPT_OUTCOME_CLASSES } from '@voice-agent/contracts';
import { OUTCOME_LABELS, OUTCOME_ORDER, formatDuration, formatMinorUnits } from './report-labels';

describe('campaign report labels', () => {
  it('labels every outcome class once, in a stable order', () => {
    expect([...OUTCOME_ORDER].sort()).toEqual([...ATTEMPT_OUTCOME_CLASSES].sort());
    expect(Object.keys(OUTCOME_LABELS).sort()).toEqual([...ATTEMPT_OUTCOME_CLASSES].sort());
  });

  it('formats ledger minor units with the currency own decimals', () => {
    const norm = (s: string) => s.replace(/\s/g, ' ');
    expect(norm(formatMinorUnits(250, 'USD'))).toBe('US$ 2,50');
    expect(norm(formatMinorUnits(250, 'BRL'))).toBe('R$ 2,50');
    expect(norm(formatMinorUnits(250, 'JPY'))).toBe('JP¥ 250');
  });

  it('never invents a currency', () => {
    expect(formatMinorUnits(250, null)).toBe('250 (unidades mínimas)');
    expect(formatMinorUnits(250, 'usd')).toBe('250 (unidades mínimas)');
  });

  it('formats durations only when known', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(125)).toBe('2 min 5 s');
  });
});
