import type { ToolExecutionContext } from '@voice-agent/contracts';
import type { Logger } from '@voice-agent/logger';
import { buildSafeLogContext } from './build-safe-log-context.js';

/**
 * D8 (DEC-047) — autorização fail-closed do `ToolExecutionEngine`.
 * O verificador é obrigatório; só o booleano `true` exato autoriza. `false`,
 * `undefined`, `null`, números, strings, objetos, Promises e exceções recusam
 * com `UNAUTHORIZED_TOOL`. O log registra só o tipo do erro, nunca argumentos.
 */
export type ToolAuthorizer = (toolName: string, context: ToolExecutionContext) => boolean;

export const TOOL_AUTHORIZER_REQUIRED_MESSAGE =
  'ToolExecutionEngine requires an isToolAllowed authorizer (fail-closed)';

export function assertToolAuthorizer(candidate: unknown): asserts candidate is ToolAuthorizer {
  if (typeof candidate !== 'function') throw new TypeError(TOOL_AUTHORIZER_REQUIRED_MESSAGE);
}

export interface ToolAuthorizationCheck {
  readonly toolName: string;
  readonly context: ToolExecutionContext;
  readonly logger: Logger;
}

export function isToolExecutionAuthorized(
  authorizer: ToolAuthorizer,
  check: ToolAuthorizationCheck,
): boolean {
  let verdict: unknown;
  try {
    verdict = authorizer(check.toolName, check.context);
  } catch (err) {
    check.logger.warn(
      'tool.execution.authorizer_failed',
      buildSafeLogContext(check.toolName, check.context, {
        errorType: err instanceof Error ? err.name : typeof err,
      }),
    );
    return false;
  }
  // Promise devolvida por engano: nunca autoriza e não vira rejeição não tratada.
  if (verdict instanceof Promise) verdict.catch(() => undefined);
  return verdict === true;
}
