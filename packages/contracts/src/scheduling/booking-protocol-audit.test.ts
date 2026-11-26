import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
  type BookingProtocolStep,
  type ProtocolOfferList,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';

type EventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

const T0 = Date.parse('2026-12-01T12:00:00Z');
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

const list = (revision: number, queryKey = `q${revision}`): ProtocolOfferList => ({
  revision,
  queryKey,
  offers: [1, 2].map((i) => ({
    offerId: `r${revision}-o${i}`,
    startsAt: iso(1440 + i * 30),
    endsAt: iso(1470 + i * 30),
    expiresAt: iso(15),
  })),
});

function session() {
  let state: BookingProtocolState = INITIAL_BOOKING_PROTOCOL_STATE;
  let seq = 0;
  let minute = 0;
  const api = {
    get state() {
      return state;
    },
    seq: () => seq,
    at: (m: number) => {
      minute = m;
    },
    send(body: EventBody, forcedSeq?: number): BookingProtocolStep {
      const step = advanceBookingProtocol(state, {
        ...body,
        seq: forcedSeq ?? ++seq,
        at: iso(minute),
      } as BookingProtocolEvent);
      state = step.state;
      return step;
    },
    say: (text: string) =>
      api.send({
        type: 'LEAD_FINAL_UTTERANCE',
        startedSeq: ++seq,
        intent: classifyLeadReply(text),
      }),
    present(revision: number) {
      api.send({ type: 'OFFER_LIST_ISSUED', list: list(revision) });
      api.send({
        type: 'SPEECH_STARTED',
        generationId: `p${revision}`,
        purpose: 'PRESENTATION',
        listRevision: revision,
      });
      return api.send({ type: 'SPEECH_COMPLETED', generationId: `p${revision}` });
    },
    authorize() {
      api.present(1);
      api.say('a primeira');
      api.send({
        type: 'SPEECH_STARTED',
        generationId: 'rb',
        purpose: 'READBACK',
        listRevision: 1,
        offerId: 'r1-o1',
      });
      api.send({ type: 'SPEECH_COMPLETED', generationId: 'rb' });
      return api.say('sim');
    },
    book() {
      api.authorize();
      const id = state.authorization!.authorizationId;
      api.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id });
      return api.send({
        type: 'BOOKING_RESULT',
        authorizationId: id,
        outcome: 'BOOKED',
        verifiedMeeting: { meetingId: 'm1', offerId: 'r1-o1' },
      });
    },
  };
  return api;
}

describe('E2 PR1 audit A3 — nothing new is accepted after the session closes', () => {
  it('BOOKED → CLOSED → new opt-out: no directive, meetingId kept', () => {
    const s = session();
    s.book();
    expect(s.send({ type: 'SESSION_CLOSED' }).state).toMatchObject({
      phase: 'CLOSED',
      meetingId: 'm1',
    });
    const late = s.say('não me liguem mais');
    expect([late.ignored, late.directives, late.state.phase, late.state.meetingId]).toEqual([
      'TERMINAL_PHASE',
      [],
      'CLOSED',
      'm1',
    ]);
  });

  it('AUTHORIZED → CLOSED → consumption, new list or new confirmation are refused', () => {
    const s = session();
    s.authorize();
    const id = s.state.authorization!.authorizationId;
    s.send({ type: 'SESSION_CLOSED' });
    for (const step of [
      s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id }),
      s.send({ type: 'OFFER_LIST_ISSUED', list: list(5) }),
      s.say('sim'),
    ]) {
      expect([step.ignored, step.directives, step.state.phase]).toEqual([
        'TERMINAL_PHASE',
        [],
        'CLOSED',
      ]);
    }
  });

  it('a duplicate of an event received before closing is ignored as a duplicate', () => {
    const s = session();
    s.present(1);
    const optOutSeq = s.seq() + 2;
    expect(s.say('não me ligue mais').directives).toEqual([{ kind: 'RECORD_OPT_OUT' }]);
    s.send({ type: 'SESSION_CLOSED' });
    const retry = s.send(
      { type: 'LEAD_FINAL_UTTERANCE', startedSeq: optOutSeq - 1, intent: { kind: 'OPT_OUT' } },
      optOutSeq,
    );
    expect([retry.ignored, retry.directives]).toEqual(['DUPLICATE_OR_OUT_OF_ORDER', []]);
    // A evidência do pedido legítimo anterior fica preservada no estado encerrado.
    expect(s.state).toMatchObject({ phase: 'CLOSED', optOutSeq });
  });

  it('a legitimate opt-out after BOOKED while the session is open is still recorded', () => {
    const s = session();
    s.book();
    const step = s.say('tira meu número');
    expect([step.state.phase, step.directives, step.state.meetingId]).toEqual([
      'OPTED_OUT',
      [{ kind: 'RECORD_OPT_OUT' }],
      'm1',
    ]);
  });
});

describe('E2 PR1 audit M1 — a discarded list can never come back', () => {
  it('refusal → IDLE → technical retry of the same revision is stale', () => {
    const s = session();
    s.present(2);
    expect(s.say('não').state.phase).toBe('IDLE');
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: list(2) }).ignored).toBe('STALE_LIST');
    expect(s.state.phase).toBe('IDLE');
  });

  it('expiry → retry of the expired revision is stale', () => {
    const s = session();
    s.present(1);
    s.at(15);
    expect(s.send({ type: 'CLOCK' }).state.phase).toBe('IDLE');
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: list(1) }).ignored).toBe('STALE_LIST');
  });

  it('replacement → retry of the older revision is stale; retry of the current one keeps order, ids and TTL', () => {
    const s = session();
    s.present(1);
    s.present(2);
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: list(1) }).ignored).toBe('STALE_LIST');
    const current = s.state.list;
    const renewed = {
      ...list(2),
      offers: list(2).offers.map((o) => ({ ...o, expiresAt: iso(60) })),
    };
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: renewed }).ignored).toBe('RETRY_SAME_LIST');
    expect(s.state.list).toBe(current);
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: list(3) }).state.phase).toBe('PRESENTING');
  });
});
