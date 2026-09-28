import { InvalidProviderMessageError } from '@voice-agent/errors';

export interface TwilioSetupMessage {
  readonly type: 'setup';
  readonly sessionId: string;
  readonly callSid: string;
  readonly parentCallSid?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly customParameters?: Readonly<Record<string, string>> | undefined;
}

export interface TwilioPromptMessage {
  readonly type: 'prompt';
  readonly voicePrompt: string;
  readonly lang?: string | undefined;
  readonly confidence?: number | undefined;
  readonly last?: boolean | undefined;
}

export interface TwilioInterruptMessage {
  readonly type: 'interrupt';
  readonly utteranceUntilInterrupt?: string | undefined;
  readonly durationUntilInterruptMs?: number | undefined;
}

export interface TwilioErrorMessage {
  readonly type: 'error';
  readonly code?: number | undefined;
  readonly description?: string | undefined;
}

export interface TwilioDisconnectMessage {
  readonly type: 'disconnect';
  readonly reason?: string | undefined;
}

export interface TwilioUnknownMessage {
  readonly type: 'unknown';
  readonly rawType: string;
}

export type TwilioInboundMessage =
  | TwilioSetupMessage
  | TwilioPromptMessage
  | TwilioInterruptMessage
  | TwilioErrorMessage
  | TwilioDisconnectMessage
  | TwilioUnknownMessage;

export interface TwilioTextTokenMessage {
  readonly type: 'text';
  readonly token: string;
  readonly last: boolean;
  readonly lang?: string | undefined;
}

export interface TwilioEndSessionMessage {
  readonly type: 'end';
  readonly handoffData?: string | undefined;
}

export type TwilioOutboundMessage = TwilioTextTokenMessage | TwilioEndSessionMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSetup(record: Record<string, unknown>): TwilioSetupMessage {
  if (typeof record.sessionId !== 'string' || typeof record.callSid !== 'string') {
    throw new InvalidProviderMessageError('Twilio setup message missing sessionId or callSid');
  }
  const customParams = isRecord(record.customParameters)
    ? (record.customParameters as Record<string, string>)
    : undefined;
  return {
    type: 'setup',
    sessionId: record.sessionId,
    callSid: record.callSid,
    parentCallSid: typeof record.parentCallSid === 'string' ? record.parentCallSid : undefined,
    from: typeof record.from === 'string' ? record.from : undefined,
    to: typeof record.to === 'string' ? record.to : undefined,
    customParameters: customParams,
  };
}

function parsePrompt(record: Record<string, unknown>): TwilioPromptMessage {
  if (typeof record.voicePrompt !== 'string') {
    throw new InvalidProviderMessageError('Twilio prompt message missing voicePrompt string');
  }
  return {
    type: 'prompt',
    voicePrompt: record.voicePrompt,
    lang: typeof record.lang === 'string' ? record.lang : undefined,
    confidence: typeof record.confidence === 'number' ? record.confidence : undefined,
    last: typeof record.last === 'boolean' ? record.last : undefined,
  };
}

function parseInterrupt(raw: Record<string, unknown>): TwilioInterruptMessage {
  const utterance =
    typeof raw.utteranceUntilInterrupt === 'string' ? raw.utteranceUntilInterrupt : undefined;
  const duration =
    typeof raw.durationUntilInterruptMs === 'number' ? raw.durationUntilInterruptMs : undefined;
  return {
    type: 'interrupt',
    utteranceUntilInterrupt: utterance,
    durationUntilInterruptMs: duration,
  };
}

function parseError(raw: Record<string, unknown>): TwilioErrorMessage {
  const code = typeof raw.code === 'number' ? raw.code : undefined;
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  return { type: 'error', code, description };
}

function parseDisconnect(raw: Record<string, unknown>): TwilioDisconnectMessage {
  const reason = typeof raw.reason === 'string' ? raw.reason : undefined;
  return { type: 'disconnect', reason };
}

export function parseTwilioInboundMessage(raw: unknown): TwilioInboundMessage {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new InvalidProviderMessageError('Payload must be an object with string type');
  }

  switch (raw.type) {
    case 'setup':
      return parseSetup(raw);
    case 'prompt':
      return parsePrompt(raw);
    case 'interrupt':
      return parseInterrupt(raw);
    case 'error':
      return parseError(raw);
    case 'disconnect':
      return parseDisconnect(raw);
    default:
      return { type: 'unknown', rawType: raw.type };
  }
}
