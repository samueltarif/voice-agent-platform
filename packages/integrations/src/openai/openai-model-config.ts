import type { OpenAiReasoningEffort } from './openai-chat-completion-types.js';

export interface OpenAiModelConfig {
  readonly apiKey?: string | undefined;
  readonly modelId: string;
  readonly apiBaseUrl: string;
  readonly maxCompletionTokens: number;
  readonly reasoningEffort?: OpenAiReasoningEffort | undefined;
  readonly defaultTemperature?: number | undefined;
}

export interface OpenAiModelConfigInput {
  readonly apiKey?: string | undefined;
  readonly modelId?: string | undefined;
  readonly apiBaseUrl?: string | undefined;
  readonly maxCompletionTokens?: number | undefined;
  readonly reasoningEffort?: OpenAiReasoningEffort | undefined;
  readonly defaultTemperature?: number | undefined;
}

export const DEFAULT_OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_TEMPERATURE = 0.7;

const VALID_REASONING_EFFORTS = new Set<string>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function resolveModelId(inputModelId?: string | undefined): string {
  const modelId = inputModelId ?? process.env.OPENAI_CONVERSATION_MODEL;
  if (!modelId || !modelId.trim()) {
    throw new Error(
      'Missing OpenAI conversation model configuration: modelId must be explicitly provided in config or via OPENAI_CONVERSATION_MODEL environment variable.',
    );
  }
  return modelId.trim();
}

function parseMaxTokensEnv(): number | undefined {
  const envVal = process.env.OPENAI_MAX_COMPLETION_TOKENS?.trim();
  return envVal ? Number(envVal) : undefined;
}

function resolveMaxCompletionTokens(inputVal?: number | undefined): number {
  const raw = inputVal ?? parseMaxTokensEnv();

  if (raw === undefined || raw === null) {
    throw new Error(
      'Missing OpenAI max completion tokens configuration: maxCompletionTokens must be explicitly provided in config or via OPENAI_MAX_COMPLETION_TOKENS environment variable.',
    );
  }

  if (!Number.isInteger(raw) || raw <= 0) {
    throw new Error(
      `Invalid OpenAI max completion tokens configuration: expected positive integer, got ${String(raw)}.`,
    );
  }

  return raw;
}

function resolveReasoningEffort(
  inputEffort?: OpenAiReasoningEffort | undefined,
): OpenAiReasoningEffort | undefined {
  const envVal = process.env.OPENAI_REASONING_EFFORT?.trim();
  const raw = inputEffort ?? (envVal ? (envVal as OpenAiReasoningEffort) : undefined);

  if (raw === undefined) {
    return undefined;
  }

  if (!VALID_REASONING_EFFORTS.has(raw)) {
    throw new Error(
      `Invalid OpenAI reasoning effort configuration: expected one of [none, minimal, low, medium, high, xhigh, max], got '${String(raw)}'.`,
    );
  }

  return raw;
}

function validateTemperatureWithReasoning(
  reasoningEffort: OpenAiReasoningEffort | undefined,
  temperature: number | undefined,
): void {
  if (reasoningEffort !== undefined && reasoningEffort !== 'none' && temperature !== undefined) {
    throw new Error(
      `Invalid OpenAI configuration: temperature is not supported when reasoning effort is active ('${reasoningEffort}'). Omit temperature.`,
    );
  }
}

function resolveApiBaseUrl(inputUrl?: string | undefined): string {
  const url = inputUrl ?? process.env.OPENAI_API_BASE_URL ?? DEFAULT_OPENAI_API_BASE_URL;
  return url.replace(/\/+$/, '');
}

export function createOpenAiModelConfig(input: OpenAiModelConfigInput = {}): OpenAiModelConfig {
  const modelId = resolveModelId(input.modelId);
  const apiBaseUrl = resolveApiBaseUrl(input.apiBaseUrl);
  const maxCompletionTokens = resolveMaxCompletionTokens(input.maxCompletionTokens);
  const reasoningEffort = resolveReasoningEffort(input.reasoningEffort);

  validateTemperatureWithReasoning(reasoningEffort, input.defaultTemperature);

  return {
    apiKey: input.apiKey ?? process.env.OPENAI_API_KEY,
    modelId,
    apiBaseUrl,
    maxCompletionTokens,
    reasoningEffort,
    defaultTemperature: input.defaultTemperature,
  };
}
