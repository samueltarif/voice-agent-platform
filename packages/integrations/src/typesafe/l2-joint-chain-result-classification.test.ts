import { describe, expect, it } from 'vitest';
import {
  EXPECTED_TYPESAFE_MODEL,
  runL2Benchmark,
} from '../../../../scripts/benchmarks/voice/run-jev-openai-l2-synthetic-integration.mjs';

function createDeterministicJevFetch() {
  return async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    void body;
    void url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: EXPECTED_TYPESAFE_MODEL,
        answers: {
          is_deterministic_candidate: { noul: 0.9 },
          is_generative_required: { noul: 0.1 },
          is_security_escalation: { noul: 0.05 },
        },
      }),
    };
  };
}

function createSuccessOpenAiFetch() {
  return async () => {
    const stream = new ReadableStream({
      start(controller) {
        const chunk = JSON.stringify({
          id: 'chatcmpl-joint-chain-test',
          object: 'chat.completion.chunk',
          created: 123456,
          model: 'gpt-6-astra',
          choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
        });
        controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\ndata: [DONE]\n\n`));
        controller.close();
      },
    });
    return { ok: true, status: 200, body: stream };
  };
}

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

describe('L2 Joint-Chain Result Classification (Human Decision A)', () => {
  it('locks 7-deterministic / 5-generative shape as PARTIAL_CHAIN_OBSERVED, not PASS_COMPLETE', async () => {
    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: createDeterministicJevFetch(),
      fakeOpenAiFetch: createSuccessOpenAiFetch(),
      dryRunWrite: true,
      logger: silentLogger,
    });

    expect(result.aggregates.matcherMatchedCount).toBe(7);
    expect(result.aggregates.matcherUnmatchedCount).toBe(5);
    expect(result.aggregates.typeSafeRequestsAttempted).toBe(7);
    expect(result.aggregates.typeSafeRequestsSucceeded).toBe(7);
    expect(result.aggregates.openAiRequestsAttempted).toBe(5);
    expect(result.aggregates.openAiRequestsSucceeded).toBe(5);
    expect(result.aggregates.deterministicCount).toBe(7);
    expect(result.aggregates.generativeCount).toBe(5);
    expect(result.aggregates.technicalFailures).toBe(0);
    expect(result.aggregates.timeouts).toBe(0);
    expect(result.aggregates.coreJointChainObserved).toBe(false);
    expect(result.metadata.classification).toBe('PARTIAL_CHAIN_OBSERVED');
    expect(result.metadata.classification).not.toBe('PASS_COMPLETE');
  });

  it('proves separate provider success does not equal single-case joint-chain success', async () => {
    const result = await runL2Benchmark({
      offlineMode: true,
      fakeTypeSafeFetch: createDeterministicJevFetch(),
      fakeOpenAiFetch: createSuccessOpenAiFetch(),
      dryRunWrite: true,
      logger: silentLogger,
    });

    const matched = result.cases.filter((c) => c.matcherMatched);
    const unmatched = result.cases.filter((c) => !c.matcherMatched);
    expect(matched).toHaveLength(7);
    expect(unmatched).toHaveLength(5);
    expect(matched.every((c) => c.jevCalled && !c.openAiCalled)).toBe(true);
    expect(unmatched.every((c) => !c.jevCalled && c.openAiCalled)).toBe(true);
    expect(unmatched.every((c) => c.technicalStatus === 'SUCCESS')).toBe(true);
  });
});
