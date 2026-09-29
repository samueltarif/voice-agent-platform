import type {
  ConversationModelInput,
  ConversationModelPort,
  ModelStreamEvent,
} from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import type { OpenAiChatCompletionRequest } from './openai-chat-completion-types.js';
import {
  mapOpenAiExceptionToError,
  mapOpenAiHttpStatusToError,
  type SafeOpenAiError,
} from './openai-error-mapper.js';
import { mapConversationInputToOpenAiMessages } from './openai-input-mapper.js';
import {
  createOpenAiModelConfig,
  type OpenAiModelConfig,
  type OpenAiModelConfigInput,
} from './openai-model-config.js';
import { type ConsumeSseParams, streamFromChunks } from './openai-stream-events.js';

export interface OpenAiAdapterDependencies {
  readonly config?: OpenAiModelConfigInput | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly logger?: Logger | undefined;
}

interface FetchResultSuccess {
  readonly ok: true;
  readonly body: ReadableStream<Uint8Array>;
}

interface FetchResultFailure {
  readonly ok: false;
  readonly error: SafeOpenAiError;
}

type FetchResult = FetchResultSuccess | FetchResultFailure;

export class OpenAiConversationModelAdapter implements ConversationModelPort {
  readonly providerName = 'openai';
  private readonly config: OpenAiModelConfig;
  private readonly fetchFn: typeof fetch;
  private readonly logger?: Logger | undefined;

  constructor(deps: OpenAiAdapterDependencies = {}) {
    this.config = createOpenAiModelConfig(deps.config);
    this.fetchFn = deps.fetchFn ?? fetch;
    this.logger = deps.logger;
  }

  async streamTurn(
    input: ConversationModelInput,
    options?: { readonly signal?: AbortSignal | undefined },
  ): Promise<AsyncIterable<ModelStreamEvent>> {
    const messages = mapConversationInputToOpenAiMessages(input);
    const body: OpenAiChatCompletionRequest = {
      model: this.config.modelId,
      messages,
      stream: true,
      max_completion_tokens: this.config.maxCompletionTokens,
      stream_options: { include_usage: true },
      ...(this.config.defaultTemperature !== undefined
        ? { temperature: this.config.defaultTemperature }
        : {}),
    };

    return this.executeStreamingRequest(input, body, options?.signal);
  }

  private async executeFetch(
    body: OpenAiChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<FetchResult> {
    const url = `${this.config.apiBaseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    const requestInit: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(signal !== undefined ? { signal } : {}),
    };

    try {
      const response = await this.fetchFn(url, requestInit);
      if (!response.ok) {
        return { ok: false, error: mapOpenAiHttpStatusToError(response.status) };
      }
      if (!response.body) {
        return { ok: false, error: mapOpenAiHttpStatusToError(500) };
      }
      return { ok: true, body: response.body };
    } catch (err) {
      return { ok: false, error: mapOpenAiExceptionToError(err) };
    }
  }

  private async *executeStreamingRequest(
    input: ConversationModelInput,
    body: OpenAiChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    const { turnId, generationId } = input;
    const fetchResult = await this.executeFetch(body, signal);

    if (!fetchResult.ok) {
      this.logSafe('warn', 'OpenAI request failed', { category: fetchResult.error.category });
      yield {
        type: 'failure',
        turnId,
        generationId,
        error: fetchResult.error.message,
        isRetryable: fetchResult.error.isRetryable,
      };
      return;
    }

    yield* this.consumeSseStream({ body: fetchResult.body, turnId, generationId, signal });
  }

  private async *consumeSseStream(params: ConsumeSseParams): AsyncIterable<ModelStreamEvent> {
    try {
      yield* streamFromChunks(params);
    } catch (err) {
      const safe = mapOpenAiExceptionToError(err);
      yield {
        type: 'failure',
        turnId: params.turnId,
        generationId: params.generationId,
        error: safe.message,
        isRetryable: safe.isRetryable,
      };
    }
  }

  private logSafe(
    level: 'info' | 'warn' | 'error',
    msg: string,
    meta: Record<string, unknown>,
  ): void {
    if (!this.logger) return;
    this.logger[level](msg, { provider: this.providerName, ...meta });
  }
}
