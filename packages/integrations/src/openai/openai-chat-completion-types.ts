export interface OpenAiChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OpenAiChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly OpenAiChatMessage[];
  readonly stream: true;
  readonly stream_options?: { readonly include_usage: boolean } | undefined;
  readonly temperature?: number | undefined;
}

export interface OpenAiUsageData {
  readonly prompt_tokens?: number | undefined;
  readonly completion_tokens?: number | undefined;
  readonly total_tokens?: number | undefined;
}

export interface OpenAiChoiceDelta {
  readonly content?: string | null | undefined;
}

export interface OpenAiStreamChoice {
  readonly index: number;
  readonly delta: OpenAiChoiceDelta;
  readonly finish_reason?: string | null | undefined;
}

export interface OpenAiChatCompletionChunk {
  readonly id?: string | undefined;
  readonly object?: string | undefined;
  readonly created?: number | undefined;
  readonly model?: string | undefined;
  readonly choices?: readonly OpenAiStreamChoice[] | undefined;
  readonly usage?: OpenAiUsageData | null | undefined;
}
