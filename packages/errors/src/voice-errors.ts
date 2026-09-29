import { AppError } from './app-error.js';

export class CallSessionNotFoundError extends AppError {
  constructor(message = 'Call session not found') {
    super(message, 404, 'CALL_SESSION_NOT_FOUND');
    this.name = 'CallSessionNotFoundError';
  }
}

export class CallRuntimeNotActiveError extends AppError {
  constructor(message = 'Call runtime is not active') {
    super(message, 409, 'CALL_RUNTIME_NOT_ACTIVE');
    this.name = 'CallRuntimeNotActiveError';
  }
}

export class StaleGenerationError extends AppError {
  constructor(message = 'Generation output is stale or cancelled') {
    super(message, 409, 'STALE_GENERATION');
    this.name = 'StaleGenerationError';
  }
}

export class ConversationModelError extends AppError {
  constructor(message = 'Conversation model execution failed') {
    super(message, 502, 'CONVERSATION_MODEL_ERROR');
    this.name = 'ConversationModelError';
  }
}

export class VoiceTransportError extends AppError {
  constructor(message = 'Voice transport operation failed') {
    super(message, 502, 'VOICE_TRANSPORT_ERROR');
    this.name = 'VoiceTransportError';
  }
}

export class InvalidAgentVersionStatusError extends AppError {
  constructor(message = 'Call session requires a PUBLISHED agent version') {
    super(message, 400, 'INVALID_AGENT_VERSION_STATUS');
    this.name = 'InvalidAgentVersionStatusError';
  }
}

export class InvalidProviderMessageError extends AppError {
  constructor(message = 'Invalid or malformed provider message') {
    super(message, 400, 'INVALID_PROVIDER_MESSAGE');
    this.name = 'InvalidProviderMessageError';
  }
}

export class UnsupportedProviderEventError extends AppError {
  constructor(message = 'Unsupported provider event type') {
    super(message, 400, 'UNSUPPORTED_PROVIDER_EVENT');
    this.name = 'UnsupportedProviderEventError';
  }
}

export class ProviderAuthenticationError extends AppError {
  constructor(message = 'Provider signature or authentication failed') {
    super(message, 401, 'PROVIDER_AUTHENTICATION_ERROR');
    this.name = 'ProviderAuthenticationError';
  }
}

export class ProviderProtocolViolationError extends AppError {
  constructor(message = 'Provider protocol violation') {
    super(message, 400, 'PROVIDER_PROTOCOL_VIOLATION');
    this.name = 'ProviderProtocolViolationError';
  }
}

export class TransportDisconnectedError extends AppError {
  constructor(message = 'Voice transport connection was closed or disconnected') {
    super(message, 409, 'TRANSPORT_DISCONNECTED');
    this.name = 'TransportDisconnectedError';
  }
}

export class InvalidCanonicalUrlError extends AppError {
  constructor(message = 'Invalid canonical request URL') {
    super(message, 400, 'INVALID_CANONICAL_URL');
    this.name = 'InvalidCanonicalUrlError';
  }
}

export class CallBootstrapNotFoundError extends AppError {
  constructor(message = 'Call bootstrap token not found') {
    super(message, 404, 'CALL_BOOTSTRAP_NOT_FOUND');
    this.name = 'CallBootstrapNotFoundError';
  }
}

export class CallBootstrapExpiredError extends AppError {
  constructor(message = 'Call bootstrap token has expired') {
    super(message, 410, 'CALL_BOOTSTRAP_EXPIRED');
    this.name = 'CallBootstrapExpiredError';
  }
}

export class CallBootstrapAlreadyConsumedError extends AppError {
  constructor(message = 'Call bootstrap token has already been consumed') {
    super(message, 409, 'CALL_BOOTSTRAP_ALREADY_CONSUMED');
    this.name = 'CallBootstrapAlreadyConsumedError';
  }
}

export class TwiMLGenerationError extends AppError {
  constructor(message = 'Failed to generate valid TwiML response') {
    super(message, 500, 'TWIML_GENERATION_ERROR');
    this.name = 'TwiMLGenerationError';
  }
}

export class InvalidProviderBindingError extends AppError {
  constructor(message = 'Invalid provider binding or bootstrap correlation') {
    super(message, 400, 'INVALID_PROVIDER_BINDING');
    this.name = 'InvalidProviderBindingError';
  }
}
