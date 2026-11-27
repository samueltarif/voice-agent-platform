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
import { mentionsSlot } from './post-call-slot-mention.js';

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
      optOut: 'NONE',
      booking: { decision: 'NONE', reason: 'NO_PENDING_INTENT' },
    });
    expect(evaluatePostCallReport(report([lead('Alô?')]), null).interlocution).toBe(true);
  });
});

describe('slot mention rule', () => {
  it('matches weekday and hour in common written forms, accent-insensitive', () => {
    const at = INTENT.startsAt;
    for (const text of [
      'segunda às 9h',
      'Segunda-feira, 09:00',
      'na segunda as 9 horas',
      'segunda, às 9',
    ]) {
      expect([text, mentionsSlot(text, at, INTENT.timeZone)]).toEqual([text, true]);
    }
    for (const text of ['segunda às dez', 'terça às 9h', 'segunda às 19h', 'às 9h']) {
      expect([text, mentionsSlot(text, at, INTENT.timeZone)]).toEqual([text, false]);
    }
    const half = '2026-11-30T12:30:00.000Z';
    expect(mentionsSlot('segunda às 9h30', half, INTENT.timeZone)).toBe(true);
    expect(mentionsSlot('segunda às 9h', half, INTENT.timeZone)).toBe(false);
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
