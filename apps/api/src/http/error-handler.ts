import type { Context } from 'hono';
import { ZodError, type ZodIssue } from 'zod';
import { AppError } from '@voice-agent/errors';
import type { Logger } from '@voice-agent/logger';
import { getRequestId } from './request-id.js';

export interface CanonicalErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue: ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

export function openApiDefaultHook(
  result: { success: boolean; error?: ZodError },
  c: Context,
): Response | void {
  if (!result.success && result.error) {
    const requestId = getRequestId(c);
    const message = formatZodIssues(result.error);
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message,
          requestId,
        },
      },
      400,
    );
  }
  return undefined;
}

export function createApiErrorHandler(logger: Logger) {
  return (err: Error, c: Context) => {
    const requestId = getRequestId(c);

    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: formatZodIssues(err),
            requestId,
          },
        },
        400,
      );
    }

    if (err instanceof AppError) {
      const status = (err.statusCode >= 400 && err.statusCode <= 599 ? err.statusCode : 500) as
        | 400
        | 401
        | 403
        | 404
        | 409
        | 500;
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            requestId,
          },
        },
        status,
      );
    }

    // Unhandled / unexpected exception: sanitize to avoid leaking internals
    logger.error('Unhandled internal server error', {
      requestId,
      errorMessage: err.message,
    });

    return c.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected internal error occurred',
          requestId,
        },
      },
      500,
    );
  };
}
