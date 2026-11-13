import type { ToolExecutionContext } from '@voice-agent/contracts';
import type { LogContext } from '@voice-agent/logger';

export function buildSafeLogContext(
  toolName: string,
  context: ToolExecutionContext,
  extra?: Record<string, unknown>,
): LogContext {
  const logCtx: Record<string, unknown> = {
    toolName,
    organizationId: context.organizationId,
  };
  if (context.callId !== undefined) logCtx.callId = context.callId;
  if (context.turnId !== undefined) logCtx.turnId = context.turnId;
  if (context.correlationId !== undefined) logCtx.correlationId = context.correlationId;
  if (extra !== undefined) {
    Object.assign(logCtx, extra);
  }
  return logCtx as LogContext;
}
