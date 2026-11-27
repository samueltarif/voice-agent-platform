/**
 * E2-V / DEC-077 — leitura ESTRUTURAL do relatório pós-chamada (`session_data_webhook`)
 * da Millis. `PROVIDER-UNVERIFIED`: o formato vem de UMA amostra anonimizada
 * (`docs/research/e2v/E2V_SESSION_REPORT_SAMPLE.anonymized.json`, sessão WebSocket
 * no navegador, exp. 5). Não há contrato oficial do corpo; campos ausentes ou
 * de tipo inesperado nunca são preenchidos por suposição.
 *
 * Observado na amostra (e só isso):
 * - `chat`: mensagens `assistant`/`user`/`tool` sem timestamp nem marcação de
 *   interrupção; `tool_calls[].function.arguments` é string JSON;
 * - `function_calls`: execução das funções, `params` com `session_id` injetado;
 * - `session_id` do provedor; `call_id` e `agent_id` nulos; `call_status: "timeout"`.
 */

export interface MillisChatToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export type MillisChatMessage =
  | {
      readonly role: 'user' | 'assistant';
      readonly content: string | null;
      readonly toolCalls: readonly MillisChatToolCall[];
    }
  | { readonly role: 'tool'; readonly name: string | null; readonly toolCallId: string | null }
  /** Papel, conteúdo ou chamada fora do formato observado. */
  | { readonly role: 'other' };

export interface MillisFunctionCall {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface MillisSessionReport {
  readonly sessionId: string;
  readonly chat: readonly MillisChatMessage[];
  readonly functionCalls: readonly MillisFunctionCall[] | 'ABSENT' | 'INVALID';
  readonly callStatus: string | null;
  readonly errorMessage: string | null;
  readonly duration: number | null;
  /** Época em segundos (`call_metrics/call_end_ts`, senão `ts`). */
  readonly endedAtEpochSeconds: number | null;
}

const OTHER: MillisChatMessage = { role: 'other' };
const MAX_REFERENCE = 128;
const MAX_TOOL_NAME = 64;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const validToolName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_TOOL_NAME;

function parseToolCall(item: unknown): MillisChatToolCall | null {
  if (!isRecord(item) || !isRecord(item.function)) return null;
  const id = str(item.id);
  const { name, arguments: args } = item.function;
  if (!id || !validToolName(name) || typeof args !== 'string') return null;
  return { id, name, arguments: args };
}

function parseToolCalls(value: unknown): MillisChatToolCall[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const calls = value.map(parseToolCall);
  return calls.every((call) => call !== null) ? (calls as MillisChatToolCall[]) : null;
}

function parseSpeech(item: Record<string, unknown>, content: string | null): MillisChatMessage {
  const role = item.role;
  if (role !== 'user' && role !== 'assistant') return OTHER;
  const toolCalls = parseToolCalls(item.tool_calls);
  if (!toolCalls || (role === 'user' && toolCalls.length > 0)) return OTHER;
  return { role, content, toolCalls };
}

function parseMessage(item: unknown): MillisChatMessage {
  if (!isRecord(item)) return OTHER;
  const content = item.content ?? null;
  if (content !== null && typeof content !== 'string') return OTHER;
  if (item.role === 'tool') {
    return { role: 'tool', name: str(item.name), toolCallId: str(item.tool_call_id) };
  }
  return parseSpeech(item, content);
}

function parseFunctionCalls(value: unknown): MillisSessionReport['functionCalls'] {
  if (value === undefined || value === null) return 'ABSENT';
  if (!Array.isArray(value)) return 'INVALID';
  const calls: MillisFunctionCall[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validToolName(item.name) || !isRecord(item.params)) return 'INVALID';
    calls.push({ name: item.name, params: item.params });
  }
  return calls;
}

/** `null` = corpo ininteligível ou sem identificador da sessão (quarentena, sem efeito). */
export function parseMillisSessionReport(rawBody: string): MillisSessionReport | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(body) || !Array.isArray(body.chat)) return null;
  const sessionId = str(body.session_id)?.trim();
  if (!sessionId || sessionId.length > MAX_REFERENCE) return null;
  return {
    sessionId,
    chat: body.chat.map(parseMessage),
    functionCalls: parseFunctionCalls(body.function_calls),
    callStatus: str(body.call_status),
    errorMessage: str(body.error_message),
    duration: num(body.duration),
    endedAtEpochSeconds: num(body['call_metrics/call_end_ts']) ?? num(body.ts),
  };
}
