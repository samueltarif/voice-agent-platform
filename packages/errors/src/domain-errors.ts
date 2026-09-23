import { AppError } from './app-error.js';

export class InvalidStateTransitionError extends AppError {
  constructor(message = 'Invalid state transition') {
    super(message, 409, 'INVALID_STATE_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class EntitlementExceededError extends AppError {
  constructor(message = 'Entitlement limit exceeded') {
    super(message, 403, 'ENTITLEMENT_EXCEEDED');
    this.name = 'EntitlementExceededError';
  }
}

export class CommercialAccessDeniedError extends AppError {
  constructor(message = 'Commercial access denied or entitlement unavailable') {
    super(message, 403, 'COMMERCIAL_ACCESS_DENIED');
    this.name = 'CommercialAccessDeniedError';
  }
}
