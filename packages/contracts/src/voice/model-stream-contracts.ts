export interface ModelTextDeltaEvent {
  readonly type: 'text.delta';
  readonly textDelta: string;
  readonly turnId: string;
  readonly generationId: string;
  readonly isFinal?: boolean | undefined;
}

export interface ModelCompletedEvent {
  readonly type: 'completed';
  readonly turnId: string;
  readonly generationId: string;
  readonly fullText: string;
}

export interface ModelUsageEvent {
  readonly type: 'usage';
  readonly turnId: string;
  readonly generationId: string;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

export interface ModelFailureEvent {
  readonly type: 'failure';
  readonly turnId: string;
  readonly generationId: string;
  readonly error: string;
  readonly isRetryable?: boolean | undefined;
}

export type ModelStreamEvent =
  ModelTextDeltaEvent | ModelCompletedEvent | ModelUsageEvent | ModelFailureEvent;
