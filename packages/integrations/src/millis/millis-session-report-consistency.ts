import type { ObservedToolCall } from './millis-session-report-entries.js';
import type { MillisSessionReport } from './millis-session-report-parse.js';

/**
 * E2-V / DEC-077 — conferência cruzada `chat.tool_calls` × `function_calls`.
 * As duas listas vêm do mesmo relatório; divergência (quantidade, ordem, nome,
 * argumentos) ou `session_id` injetado diferente da sessão do relatório ⇒ a
 * ordem do histórico não é tratada como prova (`UNKNOWN`). O `session_id`
 * injetado pela Millis nos `params` (observado) é ignorado na comparação.
 */

const INJECTED_SESSION_KEY = 'session_id';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort();
    const record = value as Record<string, unknown>;
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function withoutInjectedSession(
  params: Readonly<Record<string, unknown>>,
  chatArgs: Readonly<Record<string, unknown>> | null,
): Record<string, unknown> {
  if (chatArgs && INJECTED_SESSION_KEY in chatArgs) return { ...params };
  const { [INJECTED_SESSION_KEY]: _injected, ...rest } = params;
  return rest;
}

export function checkFunctionCalls(
  report: MillisSessionReport,
  toolCalls: readonly ObservedToolCall[],
  issues: Set<string>,
): void {
  const executed = report.functionCalls;
  if (executed === 'INVALID') return void issues.add('FUNCTION_CALLS_INVALID');
  if (executed === 'ABSENT') {
    if (toolCalls.length > 0) issues.add('FUNCTION_CALLS_ABSENT');
    return;
  }
  if (executed.length !== toolCalls.length) issues.add('FUNCTION_CALLS_MISMATCH');
  executed.forEach((call, index) => {
    const injected = call.params[INJECTED_SESSION_KEY];
    if (injected !== undefined && injected !== report.sessionId) {
      issues.add('FUNCTION_CALL_SESSION_MISMATCH');
    }
    const observed = toolCalls[index];
    const params = withoutInjectedSession(call.params, observed?.args ?? null);
    if (
      !observed ||
      observed.name !== call.name ||
      stableJson(observed.args) !== stableJson(params)
    ) {
      issues.add('FUNCTION_CALLS_MISMATCH');
    }
  });
}
