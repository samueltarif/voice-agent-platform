import { ConversationModelError } from '@voice-agent/errors';

export type OpenAiErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'timeout_network'
  | 'provider_unavailable'
  | 'invalid_request'
  | 'unknown';

export interface SafeOpenAiError {
  readonly category: OpenAiErrorCategory;
  readonly message: string;
  readonly isRetryable: boolean;
  readonly httpStatus?: number | undefined;
}

export function mapOpenAiHttpStatusToError(status: number): SafeOpenAiError {
  if (status === 401 || status === 403) {
    return {
      category: 'authentication',
      message: 'OpenAI authentication failed or invalid credentials',
      isRetryable: false,
      httpStatus: status,
    };
  }

  if (status === 429) {
    return {
      category: 'rate_limit',
      message: 'OpenAI rate limit exceeded or quota exhausted',
      isRetryable: true,
      httpStatus: status,
    };
  }

  if (status === 400 || status === 422) {
    return {
      category: 'invalid_request',
      message: 'OpenAI invalid request or policy violation',
      isRetryable: false,
      httpStatus: status,
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      category: 'provider_unavailable',
      message: 'OpenAI service temporarily unavailable',
      isRetryable: true,
      httpStatus: status,
    };
  }

  return {
    category: 'unknown',
    message: 'OpenAI provider execution failed with unexpected status',
    isRetryable: false,
    httpStatus: status,
  };
}

export function mapOpenAiExceptionToError(error: unknown): SafeOpenAiError {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        category: 'timeout_network',
        message: 'OpenAI request aborted or timed out',
        isRetryable: false,
      };
    }

    if (error.name === 'TypeError' || error.message.includes('fetch')) {
      return {
        category: 'timeout_network',
        message: 'OpenAI network connection failure',
        isRetryable: true,
      };
    }
  }

  return {
    category: 'unknown',
    message: 'OpenAI provider unexpected execution failure',
    isRetryable: false,
  };
}

export function toConversationModelError(safeError: SafeOpenAiError): ConversationModelError {
  return new ConversationModelError(safeError.message);
}
