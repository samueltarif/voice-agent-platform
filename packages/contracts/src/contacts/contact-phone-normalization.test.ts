import { describe, expect, it } from 'vitest';
import { normalizeContactPhone } from './contact-phone-normalization.js';

describe('008-MVP1 contact phone normalization', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321', 'BR_MOBILE'],
    ['11987654321', '+5511987654321', 'BR_MOBILE'],
    ['+55 11 98765-4321', '+5511987654321', 'BR_MOBILE'],
    ['5511987654321', '+5511987654321', 'BR_MOBILE'],
    ['011 98765-4321', '+5511987654321', 'BR_MOBILE'],
    ['(21) 3456-7890', '+552134567890', 'BR_LANDLINE'],
    ['55 3456-7890', '+555534567890', 'BR_LANDLINE'],
    ['+1 415 555 2671', '+14155552671', 'INTERNATIONAL'],
  ])('normalizes %s deterministically', (raw, e164, kind) => {
    expect(normalizeContactPhone(raw)).toEqual({ ok: true, e164, kind });
  });

  it.each([
    ['', 'EMPTY'],
    ['=HYPERLINK("x")', 'INVALID_CHARACTERS'],
    ['11 9876x4321', 'INVALID_CHARACTERS'],
    ['(20) 98765-4321', 'INVALID_AREA_CODE'],
    ['(11) 88765-4321', 'INVALID_SUBSCRIBER_NUMBER'],
    ['(11) 6456-7890', 'INVALID_SUBSCRIBER_NUMBER'],
    ['0800 123 4567', 'NON_GEOGRAPHIC_NUMBER'],
    ['0303 123 4567', 'NON_GEOGRAPHIC_NUMBER'],
    ['0 21 11 98765-4321', 'UNSUPPORTED_FORMAT'],
    ['+0123', 'INVALID_E164'],
    ['+55 20 98765-4321', 'INVALID_AREA_CODE'],
  ])('rejects %s as %s (never guesses)', (raw, reason) => {
    expect(normalizeContactPhone(raw)).toEqual({ ok: false, reason });
  });
});
