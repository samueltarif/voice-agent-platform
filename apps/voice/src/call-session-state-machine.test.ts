import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '@voice-agent/errors';
import {
  isValidCallSessionTransition,
  transitionCallSession,
} from './call-session-state-machine.js';
import { createCallSession } from './create-call-session.js';

describe('CallSession State Machine', () => {
  const baseInput = {
    callId: '00000000-0000-0000-0000-000000000001',
    organizationId: '11111111-1111-1111-1111-111111111111',
    agentId: '22222222-2222-2222-2222-222222222222',
    agentVersionId: '33333333-3333-3333-3333-333333333333',
  };

  it('creates call session in CREATED state', () => {
    const session = createCallSession(baseInput);
    expect(session.runtimeState).toBe('CREATED');
    expect(session.startedAt).toBeInstanceOf(Date);
    expect(session.endedAt).toBeNull();
    expect(session.currentTurnId).toBeNull();
    expect(session.generationId).toBeNull();
  });

  it('allows valid sequential lifecycle: CREATED -> CONNECTING -> ACTIVE -> ENDING -> ENDED', () => {
    const session = createCallSession(baseInput);
    const connecting = transitionCallSession(session, 'CONNECTING');
    expect(connecting.runtimeState).toBe('CONNECTING');

    const active = transitionCallSession(connecting, 'ACTIVE');
    expect(active.runtimeState).toBe('ACTIVE');

    const ending = transitionCallSession(active, 'ENDING');
    expect(ending.runtimeState).toBe('ENDING');

    const ended = transitionCallSession(ending, 'ENDED');
    expect(ended.runtimeState).toBe('ENDED');
    expect(ended.endedAt).toBeInstanceOf(Date);
  });

  it('allows transition to FAILED from CONNECTING, ACTIVE, and ENDING', () => {
    const session = createCallSession(baseInput);
    const connecting = transitionCallSession(session, 'CONNECTING');
    const failedFromConnecting = transitionCallSession(connecting, 'FAILED', {
      failureReason: 'carrier unreachable',
    });
    expect(failedFromConnecting.runtimeState).toBe('FAILED');
    expect(failedFromConnecting.failureReason).toBe('carrier unreachable');
    expect(failedFromConnecting.endedAt).toBeInstanceOf(Date);

    const active = transitionCallSession(connecting, 'ACTIVE');
    const failedFromActive = transitionCallSession(active, 'FAILED', {
      failureReason: 'media stream lost',
    });
    expect(failedFromActive.runtimeState).toBe('FAILED');

    const ending = transitionCallSession(active, 'ENDING');
    const failedFromEnding = transitionCallSession(ending, 'FAILED', {
      failureReason: 'transport crash',
    });
    expect(failedFromEnding.runtimeState).toBe('FAILED');
  });

  it('rejects invalid state transitions with InvalidStateTransitionError', () => {
    const session = createCallSession(baseInput);

    expect(() => transitionCallSession(session, 'ACTIVE')).toThrow(InvalidStateTransitionError);
    expect(() => transitionCallSession(session, 'ENDED')).toThrow(InvalidStateTransitionError);
    expect(() => transitionCallSession(session, 'ENDING')).toThrow(InvalidStateTransitionError);
  });

  it('enforces terminal states: no further transitions allowed from ENDED or FAILED', () => {
    const session = createCallSession(baseInput);
    const connecting = transitionCallSession(session, 'CONNECTING');
    const active = transitionCallSession(connecting, 'ACTIVE');
    const ending = transitionCallSession(active, 'ENDING');
    const ended = transitionCallSession(ending, 'ENDED');

    expect(() => transitionCallSession(ended, 'ACTIVE')).toThrow(InvalidStateTransitionError);
    expect(() => transitionCallSession(ended, 'FAILED')).toThrow(InvalidStateTransitionError);

    const failed = transitionCallSession(connecting, 'FAILED');
    expect(() => transitionCallSession(failed, 'ACTIVE')).toThrow(InvalidStateTransitionError);
    expect(() => transitionCallSession(failed, 'ENDED')).toThrow(InvalidStateTransitionError);
  });

  it('isValidCallSessionTransition returns expected booleans', () => {
    expect(isValidCallSessionTransition('CREATED', 'CONNECTING')).toBe(true);
    expect(isValidCallSessionTransition('CREATED', 'ACTIVE')).toBe(false);
    expect(isValidCallSessionTransition('CONNECTING', 'ACTIVE')).toBe(true);
    expect(isValidCallSessionTransition('ACTIVE', 'ENDING')).toBe(true);
    expect(isValidCallSessionTransition('ENDED', 'ACTIVE')).toBe(false);
    expect(isValidCallSessionTransition('FAILED', 'ENDED')).toBe(false);
  });

  it('rejects starting call session with non-PUBLISHED agent version (DRAFT)', () => {
    expect(() =>
      createCallSession({
        ...baseInput,
        agentVersionStatus: 'DRAFT',
      }),
    ).toThrow();
  });

  it('rejects starting call session with non-PUBLISHED agent version (ARCHIVED)', () => {
    expect(() =>
      createCallSession({
        ...baseInput,
        agentVersionStatus: 'ARCHIVED',
      }),
    ).toThrow();
  });

  it('accepts starting call session with explicit PUBLISHED agent version', () => {
    const session = createCallSession({
      ...baseInput,
      agentVersionStatus: 'PUBLISHED',
    });
    expect(session.runtimeState).toBe('CREATED');
    expect(session.agentVersionId).toBe(baseInput.agentVersionId);
  });
});
