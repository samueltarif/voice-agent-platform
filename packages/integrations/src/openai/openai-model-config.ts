export interface OpenAiModelConfig {
  readonly apiKey?: string | undefined;
  readonly modelId: string;
  readonly apiBaseUrl: string;
  readonly defaultTemperature?: number | undefined;
}

export interface OpenAiModelConfigInput {
  readonly apiKey?: string | undefined;
  readonly modelId?: string | undefined;
  readonly apiBaseUrl?: string | undefined;
  readonly defaultTemperature?: number | undefined;
}

export const DEFAULT_OPENAI_MODEL_ID = 'gpt-4o';
export const DEFAULT_OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_TEMPERATURE = 0.7;

export function createOpenAiModelConfig(input: OpenAiModelConfigInput = {}): OpenAiModelConfig {
  const modelId = input.modelId ?? process.env.OPENAI_CONVERSATION_MODEL ?? DEFAULT_OPENAI_MODEL_ID;
  const apiBaseUrl = (
    input.apiBaseUrl ??
    process.env.OPENAI_API_BASE_URL ??
    DEFAULT_OPENAI_API_BASE_URL
  ).replace(/\/+$/, '');

  const temperature = input.defaultTemperature ?? DEFAULT_OPENAI_TEMPERATURE;

  return {
    apiKey: input.apiKey ?? process.env.OPENAI_API_KEY,
    modelId,
    apiBaseUrl,
    defaultTemperature: temperature,
  };
}
