import { describe, expect, it } from 'vitest';
import { createBookingClaimFilter, isBookingClaim } from './booking-claim-filter.js';
import { mentionsOptOut } from './lead-reply-opt-out-mention.js';
import { confirmOfferArgumentsSchema, findSlotsArgumentsSchema } from './scheduling-agent-port.js';
import {
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

  it('confirm_offer accepts nothing: no booleans, ordinals, ids or turn ids', () => {
    expect(confirmOfferArgumentsSchema.safeParse({}).success).toBe(true);
    for (const bad of [
      { confirmed: true },
      { ordinal: 1 },
      { offerId: 'x' },
      { turnId: 't' },
      { authorizationId: 'a' },
    ]) {
      expect([bad, confirmOfferArgumentsSchema.safeParse(bad).success]).toEqual([bad, false]);
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
    expect(renderOfferListSpeech([label, label])).toContain('opção 2: segunda-feira');
    expect(() => renderSlotLabel('not a date', 'UTC')).toThrow(RangeError);
  });
});

describe('booking claim filter (streaming output guard)', () => {
  it('drops claims split across deltas until the server confirms the booking', () => {
    let booked = false;
    const filter = createBookingClaimFilter(() => booked);
    const out = [
      filter.push('Ótimo! Sua reunião es'),
      filter.push('tá marcada para amanhã. '),
      filter.push('Posso ajudar em mais algo?'),
      filter.flush(),
    ].join('');
    expect(out).toBe('Ótimo! Posso ajudar em mais algo?');
    expect(filter.dropped).toBe(1);
    booked = true;
    expect(filter.push('Agendei para você. ') + filter.flush()).toBe('Agendei para você. ');
  });

  it('classifies scheduling claims conservatively', () => {
    for (const claim of [
      'Já agendei.',
      'Marquei sua reunião.',
      'Reservado!',
      'Está confirmado.',
      'A reunião está ok.',
    ]) {
      expect([claim, isBookingClaim(claim)]).toEqual([claim, true]);
    }
    for (const neutral of [
      'Tudo bem?',
      'Obrigado pela atenção.',
      'Qual o melhor dia?',
      'Vocês usam algum sistema de agendamento?',
      'Posso marcar para você?',
    ]) {
      expect([neutral, isBookingClaim(neutral)]).toEqual([neutral, false]);
    }
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
  it('requires both scheduling tools together', () => {
    expect(evaluateSchedulingToolset({ tools: [] })).toBeNull();
    expect(evaluateSchedulingToolset({})).toBeNull();
    expect(
      evaluateSchedulingToolset({ tools: ['scheduling.find_slots', 'scheduling.confirm_offer'] }),
    ).toBeNull();
    expect(evaluateSchedulingToolset({ tools: ['scheduling.find_slots'] })).toBe(
      'SCHEDULING_TOOLS_INCOMPLETE',
    );
    expect(
      evaluateSchedulingToolset({ tools: ['scheduling.confirm_offer', 'catalog.search'] }),
    ).toBe('SCHEDULING_TOOLS_INCOMPLETE');
  });
});
