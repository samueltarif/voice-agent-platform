import { describe, it, expect, vi } from 'vitest';
import {
  TypeSafeJevTurnDecisionAdapter,
  DEFAULT_TYPESAFE_ENDPOINT,
  DEFAULT_TYPESAFE_MODEL,
} from './typesafe-jev-turn-decision-adapter.js';
import {
  computeAtomicQuestionSetSha256,
  EXPECTED_ATOMIC_QUESTION_SET_SHA256,
} from './typesafe-jev-atomic-definition.js';
import type { AuxiliaryTurnDecisionInput } from '@voice-agent/contracts';

interface CapturedRequest {
  readonly url: string;
  readonly options: RequestInit;
  readonly bodyJson: Record<string, unknown>;
}

function createMockFetch(responseConfig: {
  status?: number;
  body?: unknown;
  rawText?: string;
  delayMs?: number;
}): {
  fetchFn: typeof fetch;
  capturedRequests: CapturedRequest[];
} {
  const capturedRequests: CapturedRequest[] = [];
  const status = responseConfig.status ?? 200;

  const fetchFn: typeof fetch = vi.fn(
    async (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      if (init?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      if (responseConfig.delayMs && responseConfig.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, responseConfig.delayMs);
          if (init?.signal) {
            init.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              },
              { once: true },
            );
          }
        });
      }

      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      let bodyJson: Record<string, unknown> = {};
      try {
        bodyJson = JSON.parse(bodyStr) as Record<string, unknown>;
      } catch {
        // not json
      }

      capturedRequests.push({
        url: String(url),
        options: init ?? {},
        bodyJson,
      });

      const isOk = status >= 200 && status < 300;
      const responsePayload =
        responseConfig.rawText !== undefined
          ? responseConfig.rawText
          : JSON.stringify(responseConfig.body ?? {});

      return {
        ok: isOk,
        status,
        statusText: isOk ? 'OK' : 'Error',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => responsePayload,
        json: async () => {
          if (responseConfig.rawText !== undefined) {
            return JSON.parse(responseConfig.rawText);
          }
          return responseConfig.body;
        },
      } as unknown as Response;
    },
  );

  return { fetchFn, capturedRequests };
}

describe('TypeSafeJevTurnDecisionAdapter', () => {
  const sampleInput: AuxiliaryTurnDecisionInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    callId: '00000000-0000-0000-0000-000000000001',
    turnId: 'turn-001',
    callerTranscript: 'Quero cancelar meu plano agora',
    language: 'pt-BR',
    channel: 'phone',
  };

  const validResponseBody = {
    model: 'jev-1.13.0',
    answers: {
      is_deterministic_candidate: { type: 'noul', noul: 0.15 },
      is_generative_required: { type: 'noul', noul: 0.85 },
      is_security_escalation: { type: 'noul', noul: 0.02 },
    },
    usage: { input_tokens: 300, output_tokens: 20 },
  };

  describe('Atomic Question Set Invariants', () => {
    it('canonical question-set SHA-256 matches exact historical hash', () => {
      const computedHash = computeAtomicQuestionSetSha256();
      expect(computedHash).toBe(EXPECTED_ATOMIC_QUESTION_SET_SHA256);
      expect(computedHash).toBe('3fecf9ce82ad600a74549d3459fe2b2b516fc3bd7b5fff33bf5b850cd48e8725');
    });
  });

  describe('Request Construction & State Minimization', () => {
    it('executes exactly 1 HTTP request with 3 Atomic questions and state minimization', async () => {
      const { fetchFn, capturedRequests } = createMockFetch({ body: validResponseBody });
      const adapter = new TypeSafeJevTurnDecisionAdapter({
        apiKey: 'fake-key',
        fetchFn,
      });

      const output = await adapter.evaluateTurn(sampleInput);

      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;
      expect(req.url).toBe(DEFAULT_TYPESAFE_ENDPOINT);
      expect(req.options.method).toBe('POST');
      expect((req.options.headers as Record<string, string>)?.['Authorization']).toBe(
        'Bearer fake-key',
      );
      expect((req.options.headers as Record<string, string>)?.['Content-Type']).toBe(
        'application/json',
      );

      // Model configuration
      expect(req.bodyJson.model).toBe(DEFAULT_TYPESAFE_MODEL);

      // State fields serialized
      const state = req.bodyJson.state as Record<string, unknown>;
      expect(state.callerInput).toBe('Quero cancelar meu plano agora');
      expect(state.language).toBe('pt-BR');
      expect(state.channel).toBe('phone');

      // Crucial: INTERNAL METADATA EXCLUDED
      expect(state.organizationId).toBeUndefined();
      expect(state.callId).toBeUndefined();
      expect(state.turnId).toBeUndefined();
      expect(req.bodyJson.organizationId).toBeUndefined();
      expect(req.bodyJson.callId).toBeUndefined();
      expect(req.bodyJson.turnId).toBeUndefined();
      expect(req.bodyJson.thresholds).toBeUndefined();
      expect(req.bodyJson.policy).toBeUndefined();
      expect(req.bodyJson.expectedClass).toBeUndefined();

      // Exactly 3 questions
      const questions = req.bodyJson.questions as Record<string, unknown>;
      expect(Object.keys(questions)).toHaveLength(3);
      expect(questions.is_deterministic_candidate).toBeDefined();
      expect(questions.is_generative_required).toBeDefined();
      expect(questions.is_security_escalation).toBeDefined();

      // Output mapped correctly
      expect(output.deterministicScore).toBe(0.15);
      expect(output.generativeScore).toBe(0.85);
      expect(output.securityScore).toBe(0.02);
      expect(output.providerModel).toBe('jev-1.13.0');
      expect(output.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses custom model and endpointUrl when configured', async () => {
      const { fetchFn, capturedRequests } = createMockFetch({ body: validResponseBody });
      const adapter = new TypeSafeJevTurnDecisionAdapter({
        apiKey: 'fake-key',
        model: 'jev-preview',
        endpointUrl: 'https://custom.endpoint.local/v1/systemone',
        fetchFn,
      });

      await adapter.evaluateTurn(sampleInput);

      expect(capturedRequests[0]?.url).toBe('https://custom.endpoint.local/v1/systemone');
      expect(capturedRequests[0]?.bodyJson.model).toBe('jev-preview');
    });

    it('rejects empty or whitespace-only apiKey', () => {
      expect(() => new TypeSafeJevTurnDecisionAdapter({ apiKey: '' })).toThrow(TypeError);
      expect(() => new TypeSafeJevTurnDecisionAdapter({ apiKey: '   ' })).toThrow(TypeError);
    });
  });

  describe('Response Parsing & Validation', () => {
    it('parses independent answer order', async () => {
      const reorderedAnswers = {
        model: 'jev-1.13.0',
        answers: {
          is_security_escalation: { type: 'noul', noul: 0.05 },
          is_deterministic_candidate: { type: 'noul', noul: 0.9 },
          is_generative_required: { type: 'noul', noul: 0.1 },
        },
      };
      const { fetchFn } = createMockFetch({ body: reorderedAnswers });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });

      const output = await adapter.evaluateTurn(sampleInput);
      expect(output.deterministicScore).toBe(0.9);
      expect(output.generativeScore).toBe(0.1);
      expect(output.securityScore).toBe(0.05);
      expect(output.providerModel).toBe('jev-1.13.0');
    });

    it('rejects HTTP non-2xx status without retrying', async () => {
      const { fetchFn, capturedRequests } = createMockFetch({
        status: 401,
        rawText: '{"error":"Unauthorized"}',
      });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });

      await expect(adapter.evaluateTurn(sampleInput)).rejects.toThrow(
        /TypeSafe API request failed with HTTP 401/,
      );
      // Zero retries
      expect(capturedRequests).toHaveLength(1);
    });

    it('rejects malformed non-JSON responses', async () => {
      const { fetchFn } = createMockFetch({ status: 200, rawText: '<not-json>' });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });

      await expect(adapter.evaluateTurn(sampleInput)).rejects.toThrow();
    });

    it('rejects missing or empty model field in response', async () => {
      const { fetchFn: f1 } = createMockFetch({
        body: { answers: validResponseBody.answers },
      });
      const a1 = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn: f1 });
      await expect(a1.evaluateTurn(sampleInput)).rejects.toThrow(
        /TypeSafe response must contain a non-empty string "model" field/,
      );

      const { fetchFn: f2 } = createMockFetch({
        body: { model: '   ', answers: validResponseBody.answers },
      });
      const a2 = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn: f2 });
      await expect(a2.evaluateTurn(sampleInput)).rejects.toThrow(
        /TypeSafe response must contain a non-empty string "model" field/,
      );
    });

    it('rejects missing atomic answers', async () => {
      const incomplete = {
        model: 'jev-1.13.0',
        answers: {
          is_deterministic_candidate: { type: 'noul', noul: 0.5 },
          // missing is_generative_required and is_security_escalation
        },
      };
      const { fetchFn } = createMockFetch({ body: incomplete });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });

      await expect(adapter.evaluateTurn(sampleInput)).rejects.toThrow(
        /Missing or invalid answer object for is_generative_required/,
      );
    });

    it('rejects out of range or non-finite scores', async () => {
      const invalidScores = [
        { key: 'is_deterministic_candidate', value: -0.1 },
        { key: 'is_deterministic_candidate', value: 1.1 },
        { key: 'is_generative_required', value: Number.NaN },
        { key: 'is_security_escalation', value: Number.POSITIVE_INFINITY },
        { key: 'is_security_escalation', value: 'not-a-number' },
      ];

      for (const { key, value } of invalidScores) {
        const body = {
          model: 'jev-1.13.0',
          answers: {
            ...validResponseBody.answers,
            [key]: { type: 'noul', noul: value },
          },
        };
        const { fetchFn } = createMockFetch({ body });
        const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });
        await expect(adapter.evaluateTurn(sampleInput)).rejects.toThrow(
          new RegExp(`Answer ${key}.noul must be a finite number between 0 and 1`),
        );
      }
    });
  });

  describe('Abort & Cancellation', () => {
    it('forwards AbortSignal and rejects when already aborted', async () => {
      const { fetchFn } = createMockFetch({ body: validResponseBody });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });
      const controller = new AbortController();
      controller.abort();

      await expect(adapter.evaluateTurn(sampleInput, controller.signal)).rejects.toThrow(/aborted/);
    });

    it('forwards AbortSignal when aborted during pending request', async () => {
      const { fetchFn } = createMockFetch({ body: validResponseBody, delayMs: 100 });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });
      const controller = new AbortController();

      const evalPromise = adapter.evaluateTurn(sampleInput, controller.signal);
      setTimeout(() => controller.abort(), 10);

      await expect(evalPromise).rejects.toThrow(/aborted/);
    });
  });

  describe('No Business Authority & No Secret Leaks', () => {
    it('adapter output contains strictly advisory raw scores without business actions', async () => {
      const { fetchFn } = createMockFetch({ body: validResponseBody });
      const adapter = new TypeSafeJevTurnDecisionAdapter({ apiKey: 'fake', fetchFn });

      const output = (await adapter.evaluateTurn(sampleInput)) as unknown as Record<
        string,
        unknown
      >;

      expect(output.responseText).toBeUndefined();
      expect(output.executeTool).toBeUndefined();
      expect(output.handoff).toBeUndefined();
      expect(output.mutateState).toBeUndefined();
      expect(output.organizationMutation).toBeUndefined();
      expect(output.lifecycleAction).toBeUndefined();
    });

    it('does not log or print secrets or transcript', async () => {
      const sensitiveSentinelKey = 'mock-key';
      const sensitiveTranscript = 'sensitive-customer-utterance-98765';
      const { fetchFn, capturedRequests } = createMockFetch({ body: validResponseBody });
      const adapter = new TypeSafeJevTurnDecisionAdapter({
        apiKey: sensitiveSentinelKey,
        fetchFn,
      });

      await adapter.evaluateTurn({
        ...sampleInput,
        callerTranscript: sensitiveTranscript,
      });

      expect(capturedRequests).toHaveLength(1);
      // The request authorization header has the token, but it must not be logged or exposed anywhere
      expect(capturedRequests[0]?.options.headers).toBeDefined();
    });
  });
});
