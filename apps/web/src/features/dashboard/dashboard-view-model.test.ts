import { describe, expect, it } from 'vitest';
import {
  calculateCampaignProgressPercent,
  formatCurrencyBrl,
  formatPercent,
  getCallStatusBadgeVariant,
  getOutcomeBadgeVariant,
  getOutcomeLabel,
} from './dashboard-view-model';

describe('dashboard-view-model', () => {
  it('formats integer cents into formatted BRL currency string', () => {
    expect(formatCurrencyBrl(0)).toBe('R$ 0,00');
    expect(formatCurrencyBrl(92)).toBe('R$ 0,92');
    expect(formatCurrencyBrl(1842)).toBe('R$ 18,42');
    expect(formatCurrencyBrl(41250)).toBe('R$ 412,50');
  });

  it('calculates campaign progress percentage cleanly bounded to 0-100', () => {
    expect(calculateCampaignProgressPercent(42, 80)).toBe(53);
    expect(calculateCampaignProgressPercent(0, 100)).toBe(0);
    expect(calculateCampaignProgressPercent(100, 100)).toBe(100);
    expect(calculateCampaignProgressPercent(150, 100)).toBe(100);
    expect(calculateCampaignProgressPercent(10, 0)).toBe(0);
  });

  it('maps outcome statuses to proper semantic badge variants and labels', () => {
    expect(getOutcomeBadgeVariant('QUALIFIED')).toBe('success');
    expect(getOutcomeLabel('QUALIFIED')).toBe('Qualificado');

    expect(getOutcomeBadgeVariant('UNQUALIFIED')).toBe('danger');
    expect(getOutcomeLabel('UNQUALIFIED')).toBe('Sem interesse');

    expect(getOutcomeBadgeVariant('CALLBACK')).toBe('warning');
    expect(getOutcomeLabel('CALLBACK')).toBe('Retorno');

    expect(getOutcomeBadgeVariant('SCHEDULED')).toBe('handoff');
    expect(getOutcomeLabel('SCHEDULED')).toBe('Agendado');
  });

  it('maps call status to proper semantic badge variant', () => {
    expect(getCallStatusBadgeVariant('IN_CALL')).toBe('success');
    expect(getCallStatusBadgeVariant('WAITING_AGENT')).toBe('handoff');
    expect(getCallStatusBadgeVariant('CONNECTING')).toBe('warning');
  });

  it('formats percentage correctly', () => {
    expect(formatPercent(71)).toBe('71%');
  });
});
