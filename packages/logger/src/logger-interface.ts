export interface LogContext {
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly callId?: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}
