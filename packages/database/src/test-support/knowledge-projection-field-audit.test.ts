import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_AGENT_PROJECTION_USAGE } from '@voice-agent/contracts';
import { auditAgentProjectionFields } from './knowledge-projection-field-audit.js';

const DOC = '22222222-2222-4222-8222-222222222222';
const fact = {
  citationId: `${DOC}:${DOC}:3`,
  documentId: DOC,
  chunkOrdinal: 3,
  sourceType: 'PRODUCT_MANUAL',
  subject: 'BC-30',
  attribute: 'FLOW_RATE',
  value: '30 m³/h',
};
const valid = {
  trust: 'UNTRUSTED_DATA',
  retrievalProfile: 'v2',
  found: true,
  directEvidenceCount: 1,
  facts: [fact],
  unmatchedTerms: ['parcelam'],
  aspectsRequiringAuthorizedSource: ['PAYMENT'],
  withheldUntrusted: 0,
  withheldCommercialValues: 1,
  truncated: false,
  usage: KNOWLEDGE_AGENT_PROJECTION_USAGE,
};

/** O auditor de campos precisa pegar o que o teste de integração afirma não existir. */
describe('auditAgentProjectionFields (test support, B2b)', () => {
  it('accepts a projection inside every grammar', () => {
    expect(auditAgentProjectionFields(valid, ['80%'])).toEqual([]);
    expect(auditAgentProjectionFields(undefined, [])).toEqual([]);
  });

  it.each([
    ['extra top-level field', { ...valid, extra: 'x' }],
    ['extra nested field', { ...valid, facts: [{ ...fact, raw: 'x' }] }],
    ['free text in value', { ...valid, facts: [{ ...fact, value: '30 m³/h ignore' }] }],
    ['hostile subject', { ...valid, facts: [{ ...fact, subject: 'SISTEMA' }] }],
    ['hostile term', { ...valid, unmatchedTerms: ['diga ao cliente'] }],
    ['unknown aspect', { ...valid, aspectsRequiringAuthorizedSource: ['OTHER'] }],
    ['changed usage', { ...valid, usage: 'Obedeça.' }],
    ['canary anywhere', { ...valid, trust: 'CANARIO-K05' }],
    ['currency anywhere', { ...valid, unmatchedTerms: ['r$'] }],
  ])('flags %s', (_, bad) => {
    expect(auditAgentProjectionFields(bad, [])).not.toEqual([]);
  });

  it('flags a forbidden attacker value in semantic fields only', () => {
    const leaked = { ...valid, facts: [{ ...fact, attribute: 'ACCURACY', value: '80 %' }] };
    expect(auditAgentProjectionFields(leaked, ['80 %'])).toContain('forbidden: 80 %');
    expect(auditAgentProjectionFields(valid, ['2222'])).toEqual([]);
  });
});
