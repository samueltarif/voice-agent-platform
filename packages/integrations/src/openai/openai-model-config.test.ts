import { afterEach, describe, expect, it } from 'vitest';
import { createOpenAiModelConfig } from './openai-model-config.js';

describe('OpenAI Model Config Fail-Closed Boundary', () => {
  const originalEnv = process.env.OPENAI_CONVERSATION_MODEL;
  const originalMaxTokensEnv = process.env.OPENAI_MAX_COMPLETION_TOKENS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENAI_CONVERSATION_MODEL = originalEnv;
    } else {
      delete process.env.OPENAI_CONVERSATION_MODEL;
    }
    if (originalMaxTokensEnv !== undefined) {
      process.env.OPENAI_MAX_COMPLETION_TOKENS = originalMaxTokensEnv;
    } else {
      delete process.env.OPENAI_MAX_COMPLETION_TOKENS;
    }
  });

  it('fails closed and throws Error if modelId is not provided in input and env is absent', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;
    delete process.env.OPENAI_MAX_COMPLETION_TOKENS;

    expect(() => createOpenAiModelConfig({ maxCompletionTokens: 256 })).toThrowError(
      /Missing OpenAI conversation model configuration/i,
    );
  });

  it('fails closed if empty string modelId is provided', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;
    delete process.env.OPENAI_MAX_COMPLETION_TOKENS;

    expect(() =>
      createOpenAiModelConfig({ modelId: '   ', maxCompletionTokens: 256 }),
    ).toThrowError(/Missing OpenAI conversation model configuration/i);
  });

  it('succeeds when explicit modelId and maxCompletionTokens are passed in input', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;
    delete process.env.OPENAI_MAX_COMPLETION_TOKENS;

    const config = createOpenAiModelConfig({
      modelId: 'gpt-6-astra',
      apiKey: 'test-key',
      maxCompletionTokens: 256,
    });
    expect(config.modelId).toBe('gpt-6-astra');
    expect(config.apiKey).toBe('test-key');
    expect(config.maxCompletionTokens).toBe(256);
  });

  it('reads modelId from OPENAI_CONVERSATION_MODEL environment variable when input modelId is omitted', () => {
    process.env.OPENAI_CONVERSATION_MODEL = 'gpt-6-sol';
    delete process.env.OPENAI_MAX_COMPLETION_TOKENS;

    const config = createOpenAiModelConfig({ maxCompletionTokens: 256 });
    expect(config.modelId).toBe('gpt-6-sol');
    expect(config.maxCompletionTokens).toBe(256);
  });

  it('reads maxCompletionTokens from OPENAI_MAX_COMPLETION_TOKENS environment variable when input is omitted', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;
    process.env.OPENAI_MAX_COMPLETION_TOKENS = '512';

    const config = createOpenAiModelConfig({ modelId: 'gpt-6-astra' });
    expect(config.maxCompletionTokens).toBe(512);
  });

  it('fails closed and throws Error if maxCompletionTokens is missing in input and env', () => {
    delete process.env.OPENAI_MAX_COMPLETION_TOKENS;

    expect(() => createOpenAiModelConfig({ modelId: 'gpt-6-astra' })).toThrowError(
      /Missing OpenAI max completion tokens configuration/i,
    );
  });

  it('fails closed if maxCompletionTokens is zero', () => {
    expect(() =>
      createOpenAiModelConfig({ modelId: 'gpt-6-astra', maxCompletionTokens: 0 }),
    ).toThrowError(/Invalid OpenAI max completion tokens configuration/i);
  });

  it('fails closed if maxCompletionTokens is negative', () => {
    expect(() =>
      createOpenAiModelConfig({ modelId: 'gpt-6-astra', maxCompletionTokens: -100 }),
    ).toThrowError(/Invalid OpenAI max completion tokens configuration/i);
  });

  it('fails closed if maxCompletionTokens is a fraction', () => {
    expect(() =>
      createOpenAiModelConfig({ modelId: 'gpt-6-astra', maxCompletionTokens: 128.5 }),
    ).toThrowError(/Invalid OpenAI max completion tokens configuration/i);
  });

  it('fails closed if maxCompletionTokens is NaN or Infinity', () => {
    expect(() =>
      createOpenAiModelConfig({ modelId: 'gpt-6-astra', maxCompletionTokens: Number.NaN }),
    ).toThrowError(/Invalid OpenAI max completion tokens configuration/i);
    expect(() =>
      createOpenAiModelConfig({
        modelId: 'gpt-6-astra',
        maxCompletionTokens: Number.POSITIVE_INFINITY,
      }),
    ).toThrowError(/Invalid OpenAI max completion tokens configuration/i);
  });
});
