import { describe, expect, it } from 'vitest';
import { advanceBookingProtocol } from './booking-protocol.js';
import {
  BOOKING_PROTOCOL_PHASES,
  INITIAL_BOOKING_PROTOCOL_STATE,
  type BookingProtocolEvent,
  type BookingProtocolState,
  type BookingProtocolStep,
  type ProtocolOfferList,
} from './booking-protocol-types.js';
import { classifyLeadReply } from './lead-reply-intent.js';

const T0 = Date.parse('2026-12-01T12:00:00Z');
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
type EventBody = BookingProtocolEvent extends infer E
  ? E extends BookingProtocolEvent
    ? Omit<E, 'seq' | 'at'>
    : never
  : never;

function list(revision: number, count = 3, queryKey = `q${revision}`): ProtocolOfferList {
  return {
    revision,
    queryKey,
    offers: Array.from({ length: count }, (_, i) => ({
      offerId: `r${revision}-o${i + 1}`,
      startsAt: iso(60 * 24 + i * 30),
      endsAt: iso(60 * 24 + i * 30 + 30),
      expiresAt: iso(15),
    })),
  };
}

/** Sessão simulada: `seq` monotônico e instante controlados pelo "servidor". */
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
      const nextSeq = forcedSeq ?? ++seq;
      const step = advanceBookingProtocol(state, {
        ...body,
        seq: nextSeq,
        at: iso(minute),
      } as BookingProtocolEvent);
      state = step.state;
      return step;
    },
    /** O início da fala recebe seu próprio `seq` (detecção de voz) antes da fala final. */
    say(text: string, startedSeq = ++seq) {
      return api.send({
        type: 'LEAD_FINAL_UTTERANCE',
        startedSeq,
        intent: classifyLeadReply(text),
      });
    },
    present(revision = 1, count = 3, generationId = `p${revision}`) {
      api.send({ type: 'OFFER_LIST_ISSUED', list: list(revision, count) });
      api.send({
        type: 'SPEECH_STARTED',
        generationId,
        purpose: 'PRESENTATION',
        listRevision: revision,
      });
      return api.send({ type: 'SPEECH_COMPLETED', generationId });
    },
    readback(offerId: string, revision = 1, generationId = `rb-${offerId}`) {
      api.send({
        type: 'SPEECH_STARTED',
        generationId,
        purpose: 'READBACK',
        listRevision: revision,
        offerId,
      });
      return api.send({ type: 'SPEECH_COMPLETED', generationId });
    },
  };
  return api;
}

function toAuthorized() {
  const s = session();
  s.present();
  s.say('a segunda');
  s.readback('r1-o2');
  const step = s.say('sim, pode marcar');
  return { s, step };
}

describe('E2 PR1 — server-controlled booking protocol', () => {
  it('valid path: presentation → selection → readback → affirmation → single-use authorization → verified booking', () => {
    const { s, step } = toAuthorized();
    expect(s.state.phase).toBe('AUTHORIZED');
    expect(step.directives).toEqual([{ kind: 'BOOK', authorization: s.state.authorization }]);
    const id = s.state.authorization!.authorizationId;
    expect(s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id }).state.phase).toBe(
      'BOOKING',
    );
    expect(s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id }).ignored).toBe(
      'AUTHORIZATION_MISMATCH',
    );
    const booked = s.send({
      type: 'BOOKING_RESULT',
      authorizationId: id,
      outcome: 'BOOKED',
      verifiedMeeting: { meetingId: 'm1', offerId: 'r1-o2' },
    });
    expect([booked.state.phase, booked.directives]).toEqual([
      'BOOKED',
      [{ kind: 'ANNOUNCE_BOOKED', meetingId: 'm1' }],
    ]);
  });

  it('a selection alone never authorizes: it only asks for the exact readback', () => {
    const s = session();
    s.present();
    const step = s.say('a primeira');
    expect([step.state.phase, step.directives]).toEqual([
      'READBACK_PENDING',
      [{ kind: 'READ_BACK', offerId: 'r1-o1', listRevision: 1 }],
    ]);
    expect(step.state.authorization).toBeNull();
    // "sim" com várias opções não escolhe nada; com uma só, escolhe — e ainda exige releitura.
    const many = session();
    many.present();
    expect(many.say('sim').directives).toEqual([{ kind: 'ASK_CLARIFICATION' }]);
    const one = session();
    one.present(1, 1);
    expect(one.say('sim').state.phase).toBe('READBACK_PENDING');
  });

  it('negative, ambiguous, silence and time change never authorize', () => {
    for (const reply of ['não', 'acho que sim', '', 'tem outro horário?']) {
      const s = session();
      s.present();
      s.say('a primeira');
      s.readback('r1-o1');
      const step = s.say(reply);
      expect(step.state.authorization).toBeNull();
      expect(step.directives.some((d) => d.kind === 'BOOK')).toBe(false);
    }
    const s = session();
    s.present();
    expect(s.say('tem outro horário?').directives).toEqual([{ kind: 'REQUEST_NEW_LIST' }]);
    expect(s.state.list).toBeNull();
  });

  it('gives up after repeated ambiguity instead of guessing', () => {
    const s = session();
    s.present();
    s.say('hmm talvez');
    s.say('não sei');
    expect(s.say('quem sabe').directives).toEqual([{ kind: 'REQUEST_NEW_LIST' }]);
  });

  it('readback interrupted or not delivered: replies are ignored and the readback is repeated', () => {
    const s = session();
    s.present();
    s.say('a primeira');
    s.send({
      type: 'SPEECH_STARTED',
      generationId: 'rb1',
      purpose: 'READBACK',
      listRevision: 1,
      offerId: 'r1-o1',
    });
    expect(s.say('sim').ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    const interrupted = s.send({ type: 'SPEECH_INTERRUPTED', generationId: 'rb1' });
    expect([interrupted.state.phase, interrupted.directives]).toEqual([
      'READBACK_PENDING',
      [{ kind: 'READ_BACK', offerId: 'r1-o1', listRevision: 1 }],
    ]);
    expect(s.say('sim').ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    // Fala que começou ANTES da entrega completa da nova releitura não confirma.
    const startedEarly = s.seq();
    s.readback('r1-o1', 1, 'rb2');
    expect(s.say('sim', startedEarly).ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    expect(s.state.phase).toBe('AWAITING_CONFIRMATION');
  });

  it('a late reply or a late generation of list A cannot act on list B', () => {
    const s = session();
    s.present(1);
    const startedOnA = s.seq();
    s.present(2, 3, 'p2');
    expect(s.say('a primeira', startedOnA).ignored).toBe('UTTERANCE_BEFORE_DELIVERY');
    expect(s.send({ type: 'SPEECH_COMPLETED', generationId: 'p1' }).ignored).toBe(
      'STALE_GENERATION',
    );
    expect(
      s.send({
        type: 'SPEECH_STARTED',
        generationId: 'x',
        purpose: 'READBACK',
        listRevision: 1,
        offerId: 'r1-o1',
      }).ignored,
    ).toBe('STALE_LIST');
    expect(s.say('a primeira').directives).toEqual([
      { kind: 'READ_BACK', offerId: 'r2-o1', listRevision: 2 },
    ]);
  });

  it('an old presentation generation completing late does not deliver the current one', () => {
    const s = session();
    s.send({ type: 'OFFER_LIST_ISSUED', list: list(1) });
    s.send({
      type: 'SPEECH_STARTED',
      generationId: 'old',
      purpose: 'PRESENTATION',
      listRevision: 1,
    });
    s.send({ type: 'SPEECH_INTERRUPTED', generationId: 'old' });
    s.send({
      type: 'SPEECH_STARTED',
      generationId: 'new',
      purpose: 'PRESENTATION',
      listRevision: 1,
    });
    expect(s.send({ type: 'SPEECH_COMPLETED', generationId: 'old' }).ignored).toBe(
      'STALE_GENERATION',
    );
    expect(s.state.phase).toBe('PRESENTING');
  });

  it('duplicate or out-of-order events are ignored without any change', () => {
    const s = session();
    s.present();
    const before = s.state;
    const duplicate = s.send({ type: 'SPEECH_COMPLETED', generationId: 'p1' }, s.seq());
    expect([duplicate.ignored, duplicate.state]).toEqual(['DUPLICATE_OR_OUT_OF_ORDER', before]);
  });

  it('technical retry of the same query preserves the list; a genuine new list voids an authorization', () => {
    const s = session();
    s.present();
    expect(s.send({ type: 'OFFER_LIST_ISSUED', list: list(1) }).ignored).toBe('RETRY_SAME_LIST');
    expect(s.state.phase).toBe('AWAITING_SELECTION');
    const { s: a } = toAuthorized();
    const replaced = a.send({ type: 'OFFER_LIST_ISSUED', list: list(2) });
    expect([replaced.state.phase, replaced.state.authorization]).toEqual(['PRESENTING', null]);
    expect(a.send({ type: 'OFFER_LIST_ISSUED', list: list(1) }).ignored).toBe('STALE_LIST');
  });

  it('expiry and session closing void selection and authorization', () => {
    const { s } = toAuthorized();
    s.at(15);
    const id = s.state.authorization!.authorizationId;
    expect(s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id }).directives).toEqual([
      { kind: 'REQUEST_NEW_LIST' },
    ]);
    const { s: closed } = toAuthorized();
    expect(closed.send({ type: 'SESSION_CLOSED' }).state).toMatchObject({
      phase: 'CLOSED',
      authorization: null,
    });
    expect(closed.say('sim').ignored).toBe('TERMINAL_PHASE');
  });

  it('only a canonical, verified result for the SAME offer is announced as booked', () => {
    for (const [outcome, meeting] of [
      ['OFFER_EXPIRED', null],
      ['BOOKED', null],
      ['BOOKED', { meetingId: 'm', offerId: 'r1-o1' }],
    ] as const) {
      const { s } = toAuthorized();
      const id = s.state.authorization!.authorizationId;
      s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id });
      const step = s.send({
        type: 'BOOKING_RESULT',
        authorizationId: id,
        outcome,
        verifiedMeeting: meeting,
      });
      expect(step.directives[0]).toEqual({ kind: 'ANNOUNCE_NOT_BOOKED', outcome });
      expect(step.state.phase).toBe('IDLE');
    }
  });

  it('opt-out takes precedence in every non-terminal phase and keeps an already booked meeting', () => {
    const reached = new Set<string>();
    const drivers: Array<() => ReturnType<typeof session>> = [
      () => session(),
      () => {
        const s = session();
        s.send({ type: 'OFFER_LIST_ISSUED', list: list(1) });
        return s;
      },
      () => {
        const s = session();
        s.present();
        return s;
      },
      () => {
        const s = session();
        s.present();
        s.say('a primeira');
        return s;
      },
      () => {
        const s = session();
        s.present();
        s.say('a primeira');
        s.send({
          type: 'SPEECH_STARTED',
          generationId: 'g',
          purpose: 'READBACK',
          listRevision: 1,
          offerId: 'r1-o1',
        });
        return s;
      },
      () => {
        const s = session();
        s.present();
        s.say('a primeira');
        s.readback('r1-o1');
        return s;
      },
      () => toAuthorized().s,
      () => {
        const s = toAuthorized().s;
        s.send({
          type: 'AUTHORIZATION_CONSUMED',
          authorizationId: s.state.authorization!.authorizationId,
        });
        return s;
      },
    ];
    for (const drive of drivers) {
      const s = drive();
      reached.add(s.state.phase);
      const step = s.say('não me liguem mais', 0);
      expect([step.state.phase, step.directives, step.state.authorization]).toEqual([
        'OPTED_OUT',
        [{ kind: 'RECORD_OPT_OUT' }],
        null,
      ]);
    }
    expect([...reached].sort()).toEqual(
      BOOKING_PROTOCOL_PHASES.filter((p) => !['BOOKED', 'OPTED_OUT', 'CLOSED'].includes(p)).sort(),
    );
    const { s } = toAuthorized();
    const id = s.state.authorization!.authorizationId;
    s.send({ type: 'AUTHORIZATION_CONSUMED', authorizationId: id });
    s.send({
      type: 'BOOKING_RESULT',
      authorizationId: id,
      outcome: 'BOOKED',
      verifiedMeeting: { meetingId: 'm9', offerId: 'r1-o2' },
    });
    expect(s.say('tira meu número').state).toMatchObject({ phase: 'OPTED_OUT', meetingId: 'm9' });
  });
});
