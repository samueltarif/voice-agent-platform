export type VoiceInputEventType =
  | 'transport.connected'
  | 'user.speech.final'
  | 'user.interruption'
  | 'transport.disconnected'
  | 'call.end.requested'
  | 'provider.failure';

export interface BaseVoiceInputEvent {
  readonly callId: string;
  readonly organizationId: string;
  readonly timestamp: Date;
}

export interface TransportConnectedEvent extends BaseVoiceInputEvent {
  readonly type: 'transport.connected';
}

export interface UserSpeechFinalEvent extends BaseVoiceInputEvent {
  readonly type: 'user.speech.final';
  readonly turnId: string;
  readonly transcript: string;
}

export interface UserInterruptionEvent extends BaseVoiceInputEvent {
  readonly type: 'user.interruption';
  readonly turnId: string;
  readonly interruptedUtterance?: string;
  readonly interruptedDurationMs?: number;
}

export interface TransportDisconnectedEvent extends BaseVoiceInputEvent {
  readonly type: 'transport.disconnected';
  readonly reason?: string;
}

export interface CallEndRequestedEvent extends BaseVoiceInputEvent {
  readonly type: 'call.end.requested';
  readonly reason?: string;
}

export interface ProviderFailureEvent extends BaseVoiceInputEvent {
  readonly type: 'provider.failure';
  readonly error: string;
}

export type VoiceInputEvent =
  | TransportConnectedEvent
  | UserSpeechFinalEvent
  | UserInterruptionEvent
  | TransportDisconnectedEvent
  | CallEndRequestedEvent
  | ProviderFailureEvent;

export interface SpeakCommand {
  readonly type: 'speak';
  readonly callId: string;
  readonly text: string;
  readonly generationId: string;
  readonly isFinal: boolean;
}

export interface InterruptSpeechCommand {
  readonly type: 'interrupt_speech';
  readonly callId: string;
  readonly generationId?: string;
}

export interface EndCallCommand {
  readonly type: 'end_call';
  readonly callId: string;
  readonly reason?: string;
}

export type VoiceOutputCommand = SpeakCommand | InterruptSpeechCommand | EndCallCommand;
