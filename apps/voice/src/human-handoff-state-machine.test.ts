import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '@voice-agent/errors';
import {
  createHumanHandoffSession,
  isValidHandoffTransition,
  transitionHumanHandoff,
  resolveZeroSilenceFallback,
  type HumanHandoffState,
} from './human-handoff-state-machine.js';

describe('Human Handoff In-Memory State Machine (Slice 006BQ)', () => {
  const testCallId = 'call-00000000-0000-0000-0000-000000000001';

  it('A. initial state: new handoff session starts in NONE', () => {
    const session = createHumanHandoffSession(testCallId);
    expect(session.callId).toBe(testCallId);
    expect(session.state).toBe('NONE');
    expect(session.sellerId).toBeUndefined();
    expect(session.reason).toBeUndefined();
    expect(session.updatedAt).toBeInstanceOf(Date);
  });

  it('B. complete successful path: NONE -> REQUESTED -> SELLER_NOTIFIED -> SELLER_READY -> AI_PREPARING -> READY_TO_JOIN -> HUMAN_CONNECTED -> AI_DETACHED', () => {
    const session = createHumanHandoffSession(testCallId);

    const step1 = transitionHumanHandoff(session, 'REQUESTED');
    expect(step1.session.state).toBe('REQUESTED');
    expect(step1.canonicalEventName).toBe('call.handoff_requested');
    expect(step1.fallback).toBeUndefined();

    const step2 = transitionHumanHandoff(step1.session, 'SELLER_NOTIFIED');
    expect(step2.session.state).toBe('SELLER_NOTIFIED');
    expect(step2.canonicalEventName).toBe('call.seller_notified');

    const step3 = transitionHumanHandoff(step2.session, 'SELLER_READY', { sellerId: 'seller-42' });
    expect(step3.session.state).toBe('SELLER_READY');
    expect(step3.session.sellerId).toBe('seller-42');
    expect(step3.canonicalEventName).toBe('call.seller_ready');

    const step4 = transitionHumanHandoff(step3.session, 'AI_PREPARING');
    expect(step4.session.state).toBe('AI_PREPARING');
    expect(step4.session.sellerId).toBe('seller-42');

    const step5 = transitionHumanHandoff(step4.session, 'READY_TO_JOIN');
    expect(step5.session.state).toBe('READY_TO_JOIN');
    expect(step5.canonicalEventName).toBe('call.handoff_ready');

    const step6 = transitionHumanHandoff(step5.session, 'HUMAN_CONNECTED');
    expect(step6.session.state).toBe('HUMAN_CONNECTED');
    expect(step6.canonicalEventName).toBe('call.human_joined');

    const step7 = transitionHumanHandoff(step6.session, 'AI_DETACHED');
    expect(step7.session.state).toBe('AI_DETACHED');
    expect(step7.canonicalEventName).toBe('call.ai_detached');
  });

  it('C. transition ordering: illegal forward skips are rejected', () => {
    const session = createHumanHandoffSession(testCallId);

    expect(() => transitionHumanHandoff(session, 'SELLER_READY')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => transitionHumanHandoff(session, 'READY_TO_JOIN')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => transitionHumanHandoff(session, 'HUMAN_CONNECTED')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => transitionHumanHandoff(session, 'AI_DETACHED')).toThrow(
      InvalidStateTransitionError,
    );

    const requested = transitionHumanHandoff(session, 'REQUESTED').session;
    expect(() => transitionHumanHandoff(requested, 'READY_TO_JOIN')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => transitionHumanHandoff(requested, 'HUMAN_CONNECTED')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('D. no early AI detach: AI_DETACHED cannot occur before HUMAN_CONNECTED', () => {
    const session = createHumanHandoffSession(testCallId);
    const requested = transitionHumanHandoff(session, 'REQUESTED').session;
    const notified = transitionHumanHandoff(requested, 'SELLER_NOTIFIED').session;
    const ready = transitionHumanHandoff(notified, 'SELLER_READY').session;
    const preparing = transitionHumanHandoff(ready, 'AI_PREPARING').session;
    const readyToJoin = transitionHumanHandoff(preparing, 'READY_TO_JOIN').session;

    expect(() => transitionHumanHandoff(readyToJoin, 'AI_DETACHED')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('E. exceptional states: valid transitions into FAILED, CANCELED, and TIMED_OUT', () => {
    const statesBeforeConnection: HumanHandoffState[] = [
      'REQUESTED',
      'SELLER_NOTIFIED',
      'SELLER_READY',
      'AI_PREPARING',
      'READY_TO_JOIN',
    ];

    for (const state of statesBeforeConnection) {
      expect(isValidHandoffTransition(state, 'FAILED')).toBe(true);
      expect(isValidHandoffTransition(state, 'CANCELED')).toBe(true);
      expect(isValidHandoffTransition(state, 'TIMED_OUT')).toBe(true);
    }

    const session = createHumanHandoffSession(testCallId);
    const requested = transitionHumanHandoff(session, 'REQUESTED').session;

    const failed = transitionHumanHandoff(requested, 'FAILED', { reason: 'queue_unavailable' });
    expect(failed.session.state).toBe('FAILED');
    expect(failed.session.reason).toBe('queue_unavailable');
    expect(failed.canonicalEventName).toBe('call.handoff_failed');

    const session2 = createHumanHandoffSession(testCallId);
    const requested2 = transitionHumanHandoff(session2, 'REQUESTED').session;
    const canceled = transitionHumanHandoff(requested2, 'CANCELED', { reason: 'caller_declined' });
    expect(canceled.session.state).toBe('CANCELED');
    expect(canceled.canonicalEventName).toBe('call.handoff_canceled');

    const session3 = createHumanHandoffSession(testCallId);
    const requested3 = transitionHumanHandoff(session3, 'REQUESTED').session;
    const timedOut = transitionHumanHandoff(requested3, 'TIMED_OUT', {
      reason: 'seller_wait_timeout',
    });
    expect(timedOut.session.state).toBe('TIMED_OUT');
  });

  it('F. terminal behavior: terminal states reject further transitions', () => {
    const session = createHumanHandoffSession(testCallId);
    const requested = transitionHumanHandoff(session, 'REQUESTED').session;
    const failed = transitionHumanHandoff(requested, 'FAILED').session;

    expect(() => transitionHumanHandoff(failed, 'REQUESTED')).toThrow(InvalidStateTransitionError);
    expect(() => transitionHumanHandoff(failed, 'NONE')).toThrow(InvalidStateTransitionError);
  });

  it('G & H. zero-silence fallback: failure/timeout before connection requires AI conversation continuity and call remains active', () => {
    const session = createHumanHandoffSession(testCallId);
    const requested = transitionHumanHandoff(session, 'REQUESTED').session;

    const timeoutResult = transitionHumanHandoff(requested, 'TIMED_OUT', {
      reason: 'seller_unresponsive',
    });
    expect(timeoutResult.fallback).toBeDefined();
    expect(timeoutResult.fallback?.aiContinuityRequired).toBe(true);
    expect(timeoutResult.fallback?.callRemainsActive).toBe(true);
    expect(timeoutResult.fallback?.handoffPending).toBe(false);
    expect(timeoutResult.fallback?.disposition).toBe('RESUME_AI_CONVERSATION');

    const failResult = transitionHumanHandoff(requested, 'FAILED', { reason: 'carrier_error' });
    expect(failResult.fallback).toBeDefined();
    expect(failResult.fallback?.aiContinuityRequired).toBe(true);
    expect(failResult.fallback?.callRemainsActive).toBe(true);
    expect(failResult.fallback?.handoffPending).toBe(false);

    const cancelResult = transitionHumanHandoff(requested, 'CANCELED', { reason: 'user_canceled' });
    expect(cancelResult.fallback).toBeDefined();
    expect(cancelResult.fallback?.aiContinuityRequired).toBe(true);
    expect(cancelResult.fallback?.callRemainsActive).toBe(true);

    const directFallback = resolveZeroSilenceFallback('TIMED_OUT', 'timeout_reached');
    expect(directFallback.aiContinuityRequired).toBe(true);
    expect(directFallback.callRemainsActive).toBe(true);
    expect(directFallback.handoffPending).toBe(false);
    expect(directFallback.disposition).toBe('RESUME_AI_CONVERSATION');
  });

  it('I. canonical event names mapping', () => {
    const session = createHumanHandoffSession(testCallId);
    expect(transitionHumanHandoff(session, 'REQUESTED').canonicalEventName).toBe(
      'call.handoff_requested',
    );

    const requested = transitionHumanHandoff(session, 'REQUESTED').session;
    expect(transitionHumanHandoff(requested, 'SELLER_NOTIFIED').canonicalEventName).toBe(
      'call.seller_notified',
    );

    const notified = transitionHumanHandoff(requested, 'SELLER_NOTIFIED').session;
    expect(transitionHumanHandoff(notified, 'SELLER_READY').canonicalEventName).toBe(
      'call.seller_ready',
    );

    const ready = transitionHumanHandoff(notified, 'SELLER_READY').session;
    const preparing = transitionHumanHandoff(ready, 'AI_PREPARING').session;
    expect(transitionHumanHandoff(preparing, 'READY_TO_JOIN').canonicalEventName).toBe(
      'call.handoff_ready',
    );

    const readyToJoin = transitionHumanHandoff(preparing, 'READY_TO_JOIN').session;
    expect(transitionHumanHandoff(readyToJoin, 'HUMAN_CONNECTED').canonicalEventName).toBe(
      'call.human_joined',
    );

    const connected = transitionHumanHandoff(readyToJoin, 'HUMAN_CONNECTED').session;
    expect(transitionHumanHandoff(connected, 'AI_DETACHED').canonicalEventName).toBe(
      'call.ai_detached',
    );

    expect(transitionHumanHandoff(requested, 'FAILED').canonicalEventName).toBe(
      'call.handoff_failed',
    );
    expect(transitionHumanHandoff(requested, 'CANCELED').canonicalEventName).toBe(
      'call.handoff_canceled',
    );
  });

  it('L. determinism: identical state and input produce identical output', () => {
    const fixedDate = new Date('2026-10-07T12:00:00Z');
    const s1 = createHumanHandoffSession(testCallId, fixedDate);
    const s2 = createHumanHandoffSession(testCallId, fixedDate);

    const r1 = transitionHumanHandoff(s1, 'REQUESTED', { updatedAt: fixedDate });
    const r2 = transitionHumanHandoff(s2, 'REQUESTED', { updatedAt: fixedDate });

    expect(r1).toEqual(r2);
  });
});
