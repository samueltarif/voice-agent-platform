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
