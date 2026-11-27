import { describe, expect, it } from 'vitest';
import {
  normalizedProviderEventSchema,
  providerDeliveryKey,
} from '../telephony/provider-webhook-contracts.js';
import { evaluatePostCallReport, type PendingBookingIntent } from './post-call-evaluation.js';
import {
  postCallReportSchema,
  type PostCallEntry,
  type PostCallReport,
} from './post-call-report.js';
import { proposesSlot } from './post-call-slot-mention.js';

/** DEC-077 — avaliação PURA do relatório pós-chamada (linhas do tempo sintéticas). */

const INTENT: PendingBookingIntent = {
  listRevision: 2,
  option: 1,
  startsAt: '2026-11-30T12:00:00.000Z', // segunda-feira, 09:00 em São Paulo
  timeZone: 'America/Sao_Paulo',
};
const CALL: PostCallEntry = {
  kind: 'TOOL_CALL',
  toolName: 'scheduling.request_booking',
  arguments: { listRevision: 2, option: 1, leadConfirmation: 'sim' },
};
const READBACK: PostCallEntry = { kind: 'AGENT', text: 'Confirma segunda-feira às 9h?' };
const lead = (text: string): PostCallEntry => ({ kind: 'LEAD', text });

const report = (entries: PostCallEntry[], over: Partial<PostCallReport> = {}): PostCallReport => ({
  ordering: 'TIMELINE',
  integrity: 'COMPLETE',
  entries,
  endReason: 'COMPLETED',
  durationSeconds: 60,
  ...over,
});
const booking = (entries: PostCallEntry[], over?: Partial<PostCallReport>) =>
  evaluatePostCallReport(report(entries, over), INTENT).booking;

describe('acceptance only from the history, bound to the offer', () => {
  it('accepts an explicit "yes" right after a readback that names the weekday and hour', () => {
    expect(booking([READBACK, lead('Sim, pode marcar.'), CALL])).toEqual({
      decision: 'ACCEPTED',
      reason: 'LEAD_AFFIRMED_READBACK',
    });
  });

  it('never accepts from the tool phrase, a selection, a question or a quoted yes', () => {
    for (const reply of [
      'A primeira.',
      'Pode marcar?',
      '“sim”',
      'Sim, mas não marque.',
      'Talvez.',
    ]) {
      expect([reply, booking([READBACK, lead(reply), CALL]).decision]).toEqual([reply, 'REVIEW']);
    }
    expect(booking([READBACK, CALL]).reason).toBe('NO_LEAD_REPLY');
  });

  it('rejects a refusal; reviews a contradiction after the request', () => {
    expect(booking([READBACK, lead('Não, obrigado.'), CALL])).toEqual({
      decision: 'REJECTED',
      reason: 'LEAD_DECLINED',
    });
    expect(booking([READBACK, lead('Sim.'), CALL, lead('Não, espera.')]).reason).toBe(
      'LEAD_REPLY_AFTER_REQUEST',
    );
  });

  it('requires the readback of THIS slot and the call for THIS list and option', () => {
    const otherHour: PostCallEntry = { kind: 'AGENT', text: 'Confirma segunda-feira às 10h?' };
    const otherDay: PostCallEntry = { kind: 'AGENT', text: 'Confirma terça às 9h?' };
    for (const readback of [otherHour, otherDay]) {
      expect(booking([readback, lead('Sim.'), CALL]).reason).toBe('READBACK_NOT_EVIDENT');
    }
    const wrongOption = { ...CALL, arguments: { listRevision: 2, option: 2 } } as PostCallEntry;
    const wrongList = { ...CALL, arguments: { listRevision: 1, option: 1 } } as PostCallEntry;
    for (const call of [wrongOption, wrongList]) {
      expect(booking([READBACK, lead('Sim.'), call]).reason).toBe('TOOL_CALL_NOT_IN_REPORT');
    }
  });

  it('decides nothing that depends on order when the order is not proven', () => {
    expect(booking([READBACK, lead('Sim.'), CALL], { ordering: 'UNKNOWN' }).reason).toBe(
      'ORDERING_UNKNOWN',
    );
  });
});

describe('opt-out and interlocution evidence', () => {
  it('an opt-out request wins over any acceptance; an unclear mention goes to review', () => {
    const optOut = evaluatePostCallReport(
      report([READBACK, lead('Sim.'), CALL, lead('Não me ligue mais.')]),
      INTENT,
    );
    expect(optOut.optOut).toBe('REQUESTED');
    expect(optOut.booking).toEqual({ decision: 'REJECTED', reason: 'OPT_OUT_REQUESTED' });
    const mention = evaluatePostCallReport(
      report([
        READBACK,
        lead('Sim.'),
        CALL,
        lead('Se eu mudar de ideia, vou pedir para tirar meu número.'),
      ]),
      INTENT,
    );
    expect(mention.optOut).toBe('MENTIONED');
    expect(mention.booking.decision).toBe('REVIEW');
  });

  it('a tool call or the agent talking is not interlocution; empty lead turns are silence', () => {
    const silent = evaluatePostCallReport(report([READBACK, lead(''), CALL]), null);
    expect(silent).toEqual({
      interlocution: false,
      complete: true,
      optOut: 'NONE',
      booking: { decision: 'NONE', reason: 'NO_PENDING_INTENT' },
    });
    expect(evaluatePostCallReport(report([lead('Alô?')]), null).interlocution).toBe(true);
  });
});

describe('readback rule: affirmative proposal of exactly the offered slot (audit #184 A1)', () => {
  const at = INTENT.startsAt;
  const proposes = (text: string, startsAt = at) => proposesSlot(text, startsAt, INTENT.timeZone);

  it('accepts one weekday and one complete time equal to the offer, with a proposal verb', () => {
    for (const text of [
      'Confirma segunda às 9h?',
      'Posso marcar segunda-feira, 09:00?',
      'Posso agendar na segunda as 9 horas?',
      'Confirmando: segunda, às 9.',
      'Só para confirmar: segunda-feira, 30 de novembro, às 9h. Posso marcar?',
      'Confirma segunda, dia 30, às 9h?',
    ]) {
      expect([text, proposes(text)]).toEqual([text, true]);
    }
    const half = '2026-11-30T12:30:00.000Z';
    expect(proposes('Confirma segunda às 9h30?', half)).toBe(true);
    expect(proposes('Confirma segunda às 9 e meia?', half)).toBe(true);
    expect(proposes('Confirma segunda às 9h?', half)).toBe(false);
  });

  it('rejects another minute, alternatives, negation, new queries and conflicting dates', () => {
    for (const text of [
      'Confirma segunda às 9:30?',
      'Confirma segunda às 9h30?',
      'Segunda às 9h está indisponível. Posso consultar terça?',
      'Segunda às 9h não dá. Posso marcar?',
      'Posso marcar segunda às 9h ou às 10h?',
      'Posso marcar segunda ou terça às 9h?',
      'Confirma terça às 9h?',
      'Confirma segunda às 19h?',
      'Confirma segunda às dez?',
      'Confirma às 9h?',
      'Segunda às 9h.',
      'Confirma segunda, dia 7, às 9h?',
      'Confirma segunda, 07/12, às 9h?',
      'Confirma amanhã, segunda, às 9h?',
      'Posso verificar outro horário na segunda às 9h?',
    ]) {
      expect([text, proposes(text)]).toEqual([text, false]);
    }
  });

  it('the Codex scenarios never become an acceptance', () => {
    for (const readback of [
      'Confirma segunda às 9:30?',
      'Segunda às 9h está indisponível. Posso consultar terça?',
    ]) {
      const agent: PostCallEntry = { kind: 'AGENT', text: readback };
      expect(booking([agent, lead('Sim.'), CALL])).toEqual({
        decision: 'REVIEW',
        reason: 'READBACK_NOT_EVIDENT',
      });
    }
  });
});

describe('last request and history integrity (audit #184 A2/A3)', () => {
  const callFor = (option: number): PostCallEntry => ({
    kind: 'TOOL_CALL',
    toolName: 'scheduling.request_booking',
    arguments: { listRevision: 2, option, leadConfirmation: 'sim' },
  });

  it('a later request for another option makes the surviving intent doubtful', () => {
    const later = { kind: 'AGENT' as const, text: 'Confirma segunda às 9h30?' };
    const entries = [READBACK, lead('Sim.'), CALL, later, lead('Sim.'), callFor(2)];
    expect(booking(entries)).toEqual({ decision: 'REVIEW', reason: 'LAST_REQUEST_MISMATCH' });
  });

  it('an incomplete history never accepts, whatever it contains', () => {
    const entries = [READBACK, lead('Sim, pode marcar.'), CALL];
    expect(booking(entries, { integrity: 'INCOMPLETE' })).toEqual({
      decision: 'REVIEW',
      reason: 'HISTORY_INCOMPLETE',
    });
    const evaluation = evaluatePostCallReport(
      report([lead('Não me ligue mais.')], { integrity: 'INCOMPLETE' }),
      null,
    );
    expect(evaluation).toMatchObject({ complete: false, optOut: 'REQUESTED' });
  });

  it('the integrity flag is mandatory in the normalized contract', () => {
    const { integrity: _omit, ...withoutIntegrity } = report([lead('Sim.')]);
    expect(postCallReportSchema.safeParse(withoutIntegrity).success).toBe(false);
  });
});

describe('normalized post-call report contract', () => {
  it('is strict and vendor-neutral; one delivery key per call', () => {
    const event = {
      kind: 'SESSION_REPORT' as const,
      providerEventId: null,
      providerCallReference: 'ref-1',
      occurredAt: '2026-11-30T12:05:00.000Z',
      report: report([READBACK, lead('Sim.'), CALL]),
    };
    expect(normalizedProviderEventSchema.safeParse(event).success).toBe(true);
    expect(providerDeliveryKey('p', event)).toBe('p|ref|ref-1|SESSION_REPORT');
    for (const bad of [
      { ...event, organizationId: 'x' },
      { ...event, report: { ...event.report, tenant: 'x' } },
      { ...event, report: { ...event.report, endReason: 'NOT_INTERESTED' } },
      { ...event, report: { ...event.report, entries: [{ kind: 'SYSTEM', text: 'x' }] } },
    ]) {
      expect(normalizedProviderEventSchema.safeParse(bad).success).toBe(false);
    }
    expect(
      postCallReportSchema.safeParse({ ...event.report, entries: Array(501).fill(lead('a')) })
        .success,
    ).toBe(false);
  });
});
