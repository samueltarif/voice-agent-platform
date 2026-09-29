import { afterEach, describe, expect, it } from 'vitest';
import { createOpenAiModelConfig } from './openai-model-config.js';

describe('OpenAI Model Config Fail-Closed Boundary', () => {
  const originalEnv = process.env.OPENAI_CONVERSATION_MODEL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENAI_CONVERSATION_MODEL = originalEnv;
    } else {
      delete process.env.OPENAI_CONVERSATION_MODEL;
    }
  });

  it('fails closed and throws Error if modelId is not provided in input and env is absent', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;

    expect(() => createOpenAiModelConfig({})).toThrowError(
      /Missing OpenAI conversation model configuration/i,
    );
  });

  it('fails closed if empty string modelId is provided', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;

    expect(() => createOpenAiModelConfig({ modelId: '   ' })).toThrowError(
      /Missing OpenAI conversation model configuration/i,
    );
  });

  it('succeeds when explicit modelId is passed in input', () => {
    delete process.env.OPENAI_CONVERSATION_MODEL;

    const config = createOpenAiModelConfig({ modelId: 'gpt-6-astra', apiKey: 'test-key' });
    expect(config.modelId).toBe('gpt-6-astra');
    expect(config.apiKey).toBe('test-key');
  });

  it('reads modelId from OPENAI_CONVERSATION_MODEL environment variable when input modelId is omitted', () => {
    process.env.OPENAI_CONVERSATION_MODEL = 'gpt-6-sol';

    const config = createOpenAiModelConfig({});
    expect(config.modelId).toBe('gpt-6-sol');
  });
});
