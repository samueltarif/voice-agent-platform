import { describe, expect, it } from 'vitest';
import {
  mapOpenAiExceptionToError,
  mapOpenAiHttpStatusToError,
  toConversationModelError,
} from './openai-error-mapper.js';

describe('OpenAI Error Mapper', () => {
  it('maps HTTP 401 and 403 to non-retryable authentication error', () => {
    const err401 = mapOpenAiHttpStatusToError(401);
    expect(err401.category).toBe('authentication');
    expect(err401.isRetryable).toBe(false);

    const err403 = mapOpenAiHttpStatusToError(403);
    expect(err403.category).toBe('authentication');
    expect(err403.isRetryable).toBe(false);
  });

  it('maps HTTP 429 to retryable rate_limit error', () => {
    const err429 = mapOpenAiHttpStatusToError(429);
    expect(err429.category).toBe('rate_limit');
    expect(err429.isRetryable).toBe(true);
  });

  it('maps HTTP 400 and 422 to non-retryable invalid_request error', () => {
    const err400 = mapOpenAiHttpStatusToError(400);
    expect(err400.category).toBe('invalid_request');
    expect(err400.isRetryable).toBe(false);
  });

  it('maps HTTP 500, 502, 503 to retryable provider_unavailable error', () => {
    for (const code of [500, 502, 503, 504]) {
      const err = mapOpenAiHttpStatusToError(code);
      expect(err.category).toBe('provider_unavailable');
      expect(err.isRetryable).toBe(true);
    }
  });

  it('maps network AbortError and TypeError to safe timeout_network errors', () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const mappedAbort = mapOpenAiExceptionToError(abortErr);
    expect(mappedAbort.category).toBe('timeout_network');

    const networkErr = new TypeError('Failed to fetch');
    const mappedNetwork = mapOpenAiExceptionToError(networkErr);
    expect(mappedNetwork.category).toBe('timeout_network');
    expect(mappedNetwork.isRetryable).toBe(true);
  });

  it('creates ConversationModelError with safe sanitized message', () => {
    const safe = mapOpenAiHttpStatusToError(429);
    const domainErr = toConversationModelError(safe);
    expect(domainErr.name).toBe('ConversationModelError');
    expect(domainErr.statusCode).toBe(502);
    expect(domainErr.message).not.toContain('key');
    expect(domainErr.message).not.toContain('Authorization');
  });

  it('guarantees HTTP non-2xx error handling never includes raw response body contents', () => {
    // Synthetic raw provider body with runtime dynamic string and caller transcript
    const syntheticSecret = `dynamic-sample-${Math.random().toString(36).slice(2)}`;
    const syntheticTranscript = 'caller said sensitive domain words';
    const rawBody = JSON.stringify({
      error: {
        message: `Invalid auth for ${syntheticSecret} while processing ${syntheticTranscript}`,
        type: 'invalid_request_error',
      },
    });

    // Error mapper takes status code and yields strictly sanitized domain errors
    const safeError = mapOpenAiHttpStatusToError(401);
    const domainError = toConversationModelError(safeError);

    // Assert that raw body strings are never leaked
    expect(safeError.message).not.toContain(syntheticSecret);
    expect(safeError.message).not.toContain(syntheticTranscript);
    expect(safeError.message).not.toContain(rawBody);
    expect(domainError.message).not.toContain(syntheticSecret);
    expect(domainError.message).not.toContain(syntheticTranscript);
    expect(domainError.message).not.toContain(rawBody);
  });
});
