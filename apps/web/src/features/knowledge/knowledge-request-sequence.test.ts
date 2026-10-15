import { describe, it, expect } from 'vitest';
import { createKnowledgeRequestSequence } from './knowledge-request-sequence';

describe('createKnowledgeRequestSequence (stale-result guard)', () => {
  it('accepts the latest ticket and rejects earlier ones', () => {
    const seq = createKnowledgeRequestSequence();
    const first = seq.next();
    const second = seq.next();
    expect(seq.isCurrent(second)).toBe(true);
    expect(seq.isCurrent(first)).toBe(false);
  });

  it('rejects all prior tickets after rapid successive requests', () => {
    const seq = createKnowledgeRequestSequence();
    const t0 = seq.next();
    const t1 = seq.next();
    const t2 = seq.next();
    const t3 = seq.next();
    expect(seq.isCurrent(t3)).toBe(true);
    for (const stale of [t0, t1, t2]) expect(seq.isCurrent(stale)).toBe(false);
  });

  it('simulates out-of-order completion: slow first response is stale', async () => {
    const seq = createKnowledgeRequestSequence();
    const applied: string[] = [];
    const slow = seq.next();
    const fast = seq.next();
    const slowTask = Promise.resolve('slow').then((v) => {
      if (seq.isCurrent(slow)) applied.push(v);
    });
    const fastTask = Promise.resolve('fast').then((v) => {
      if (seq.isCurrent(fast)) applied.push(v);
    });
    await Promise.all([slowTask, fastTask]);
    expect(applied).toEqual(['fast']);
  });

  it('unknown and zero tickets are never current', () => {
    const seq = createKnowledgeRequestSequence();
    seq.next();
    expect(seq.isCurrent(0)).toBe(false);
    expect(seq.isCurrent(999)).toBe(false);
  });

  it('independent sequences do not interfere', () => {
    const a = createKnowledgeRequestSequence();
    const b = createKnowledgeRequestSequence();
    const ticketA = a.next();
    b.next();
    b.next();
    expect(a.isCurrent(ticketA)).toBe(true);
  });
});
