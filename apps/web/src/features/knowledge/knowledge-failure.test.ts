import { describe, it, expect } from 'vitest';
import { failureOf, kindFromFailure } from './knowledge-failure';

describe('knowledge failure mapping', () => {
  it('maps ORG_CONTEXT_MISMATCH to org-changed regardless of the HTTP status', () => {
    expect(kindFromFailure({ status: 409, code: 'ORG_CONTEXT_MISMATCH' })).toBe('org-changed');
  });

  it('keeps status-based mapping for other conflicts and unknown errors', () => {
    expect(kindFromFailure({ status: 409, code: 'CONFLICT' })).toBe('conflict');
    expect(kindFromFailure(failureOf(new Error('boom')))).toBe('connection');
    expect(kindFromFailure(failureOf({ status: 500 }))).toBe('internal');
  });
});

describe('archive-specific conflict (F-U2)', () => {
  it('maps 409 to archive-conflict only for the archive operation', () => {
    expect(kindFromFailure({ status: 409 }, 'archive')).toBe('archive-conflict');
    expect(kindFromFailure({ status: 409 }, 'ingest')).toBe('conflict');
    expect(kindFromFailure({ status: 409 })).toBe('conflict');
  });
});
