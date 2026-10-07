import type { z } from 'zod';
import type { ToolExecutionContext } from './tool-invocation-contracts.js';

export interface ToolValidationSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ToolValidationFailure {
  readonly success: false;
  readonly error: string;
}

export type ToolValidationResult<T> = ToolValidationSuccess<T> | ToolValidationFailure;

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description?: string | undefined;
  readonly validateInput: (args: unknown) => ToolValidationResult<TInput>;
  readonly execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}

export function createZodToolValidator<T>(
  schema: z.ZodType<T>,
): (args: unknown) => ToolValidationResult<T> {
  return (args: unknown): ToolValidationResult<T> => {
    const parsed = schema.safeParse(args);
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    return { success: false, error: message || 'Invalid tool arguments' };
  };
}
