import { describe, it, expect } from 'vitest';
import { formatAgentDate } from './agent-date-formatter.js';

describe('formatAgentDate (Deterministic Formatter)', () => {
  it('formats UTC ISO date string correctly to Brazilian format', () => {
    const formatted = formatAgentDate('2026-09-25T14:30:00.000Z');
    expect(formatted).toBe('25/09/2026 14:30');
  });

  it('handles null, undefined and invalid date gracefully', () => {
    expect(formatAgentDate(null)).toBe('-');
    expect(formatAgentDate(undefined)).toBe('-');
    expect(formatAgentDate('invalid-date')).toBe('-');
  });
});
