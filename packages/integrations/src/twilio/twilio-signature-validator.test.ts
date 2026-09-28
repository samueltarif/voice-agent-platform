import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildTwilioSignaturePayload,
  validateTwilioSignature,
} from './twilio-signature-validator.js';

describe('Twilio Signature Validator', () => {
  const syntheticAuthToken = 'synthetic_test_auth_token_0123456789';
  const url = 'https://api.voice-agent.example.com/api/voice/relay';

  it('validates a valid signature generated with synthetic secret', () => {
    const params = {
      AccountSid: 'AC_synthetic_account',
      CallSid: 'CA_synthetic_call',
      From: '+5511999999999',
    };
    const payload = buildTwilioSignaturePayload(url, params);
    const validSignature = createHmac('sha1', syntheticAuthToken)
      .update(payload, 'utf8')
      .digest('base64');

    const isValid = validateTwilioSignature({
      url,
      params,
      signature: validSignature,
      authToken: syntheticAuthToken,
    });

    expect(isValid).toBe(true);
  });

  it('correctly sorts parameters alphabetically when building signature payload', () => {
    const params = {
      Zebra: 'last',
      Apple: 'first',
      Middle: 'center',
    };
    const payload = buildTwilioSignaturePayload(url, params);
    expect(payload).toBe(`${url}ApplefirstMiddlecenterZebralast`);
  });

  it('rejects an invalid signature with mismatched digest', () => {
    const params = { CallSid: 'CA_test' };
    const isValid = validateTwilioSignature({
      url,
      params,
      signature: 'invalid_base64_signature==',
      authToken: syntheticAuthToken,
    });

    expect(isValid).toBe(false);
  });

  it('rejects when signature is missing, null, or empty string', () => {
    expect(
      validateTwilioSignature({
        url,
        signature: undefined,
        authToken: syntheticAuthToken,
      }),
    ).toBe(false);

    expect(
      validateTwilioSignature({
        url,
        signature: null,
        authToken: syntheticAuthToken,
      }),
    ).toBe(false);

    expect(
      validateTwilioSignature({
        url,
        signature: '',
        authToken: syntheticAuthToken,
      }),
    ).toBe(false);
  });

  it('rejects when authToken is missing or empty', () => {
    expect(
      validateTwilioSignature({
        url,
        signature: 'some_sig',
        authToken: undefined,
      }),
    ).toBe(false);

    expect(
      validateTwilioSignature({
        url,
        signature: 'some_sig',
        authToken: '',
      }),
    ).toBe(false);
  });
});
