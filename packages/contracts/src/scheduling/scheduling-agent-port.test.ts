import { describe, expect, it } from 'vitest';
import { mentionsOptOut } from './lead-reply-opt-out-mention.js';
import {
  findSlotsArgumentsSchema,
  requestBookingArgumentsSchema,
} from './scheduling-agent-port.js';
import {
  renderBookingPendingSpeech,
  renderOfferListSpeech,
  renderReadbackSpeech,
  renderSlotLabel,
} from './scheduling-speech.js';
import { evaluateSchedulingToolset } from './scheduling-toolset-publication.js';

/** E2 PR 2 (DEC-075) — contratos puros das ferramentas de agendamento. */

describe('tool arguments carry no authority', () => {
  it('find_slots accepts only an optional valid local day', () => {
    expect(findSlotsArgumentsSchema.safeParse({}).success).toBe(true);
    expect(findSlotsArgumentsSchema.safeParse({ day: '2026-12-01' }).success).toBe(true);
    for (const bad of [
      { day: '2026-02-30' },
      { day: '01/12/2026' },
      { calendarId: 'x' },
      { leadId: 'x' },
      { day: '2026-12-01', offerId: 'x' },
    ]) {
      expect([bad, findSlotsArgumentsSchema.safeParse(bad).success]).toEqual([bad, false]);
    }
  });

  it('request_booking accepts only the list revision, option and a bounded phrase', () => {
    const ok = { listRevision: 2, option: 1, leadConfirmation: 'Sim, pode marcar.' };
    expect(requestBookingArgumentsSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      {},
      { ...ok, offerId: 'x' },
      { ...ok, confirmed: true },
      { ...ok, leadId: 'x' },
      { ...ok, option: 4 },
      { ...ok, option: 0 },
      { ...ok, listRevision: 0 },
      { ...ok, leadConfirmation: '' },
      { ...ok, leadConfirmation: 'x'.repeat(301) },
    ]) {
      expect([bad, requestBookingArgumentsSchema.safeParse(bad).success]).toEqual([bad, false]);
    }
  });
});

describe('deterministic speech includes date, time and time zone', () => {
  it('renders the exact slot in the calendar zone', () => {
    const label = renderSlotLabel('2026-11-30T12:00:00.000Z', 'America/Sao_Paulo');
    expect(label).toBe(
      'segunda-feira, 30 de novembro de 2026, às 09:00, fuso America/Sao_Paulo (GMT-03:00)',
    );
    expect(renderSlotLabel('2026-11-30T12:00:00.000Z', 'UTC')).toContain(
      'às 12:00, fuso UTC (GMT+00:00)',
    );
    expect(renderReadbackSpeech(label)).toContain(label);
    // DEC-077: a intenção registrada NUNCA afirma reserva.
    expect(renderBookingPendingSpeech(label)).toContain(label);
    expect(renderBookingPendingSpeech(label)).not.toMatch(/marcada|confirmada|agendad/i);
    expect(renderOfferListSpeech([label, label])).toContain('opção 2: segunda-feira');
    expect(() => renderSlotLabel('not a date', 'UTC')).toThrow(RangeError);
  });
});

describe('possible opt-out mention (blocks commercial progress)', () => {
  it('detects unrecognized or conditional opt-out mentions, including quoted ones', () => {
    for (const text of [
      'Tire meu número da lista, mas só se eu confirmar amanhã.',
      'Ela disse: “Não me ligue mais.”',
      'Me descadastre, só que não.',
      'Se eu mudar de ideia, vou pedir para tirar meu número.',
    ]) {
      expect([text, mentionsOptOut(text)]).toEqual([text, true]);
    }
    for (const text of ['Sim, pode marcar.', 'A segunda.', 'Hoje não posso.']) {
      expect([text, mentionsOptOut(text)]).toEqual([text, false]);
    }
  });
});

describe('scheduling toolset publication rule', () => {
  it('requires both scheduling tools together, plus the opt-out tool (DEC-077)', () => {
    expect(evaluateSchedulingToolset({ tools: [] })).toBeNull();
    expect(evaluateSchedulingToolset({})).toBeNull();
    const both = ['scheduling.find_slots', 'scheduling.request_booking'] as const;
    expect(evaluateSchedulingToolset({ tools: [...both, 'lead.record_opt_out'] })).toBeNull();
    expect(evaluateSchedulingToolset({ tools: [...both] })).toBe('SCHEDULING_TOOLS_INCOMPLETE');
    expect(evaluateSchedulingToolset({ tools: ['scheduling.find_slots'] })).toBe(
      'SCHEDULING_TOOLS_INCOMPLETE',
    );
    expect(
      evaluateSchedulingToolset({ tools: ['scheduling.request_booking', 'catalog.search'] }),
    ).toBe('SCHEDULING_TOOLS_INCOMPLETE');
  });
});
