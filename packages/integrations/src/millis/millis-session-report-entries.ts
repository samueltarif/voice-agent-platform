import {
  POST_CALL_MAX_ENTRIES,
  POST_CALL_MAX_TEXT,
  type PostCallEntry,
} from '@voice-agent/contracts';
import type { MillisChatMessage, MillisSessionReport } from './millis-session-report-parse.js';

/**
 * E2-V / DEC-077 — `chat` → entradas neutras, sem inventar evidência:
 * - `user` → LEAD; `assistant` → AGENT (texto como veio, inclusive mensagens
 *   parciais/interrompidas, que o relatório NÃO marca; texto não prova reprodução);
 *   fala cortada no limite leva `truncated` (reauditoria A3); fala sem texto
 *   legível é perda (`SPEECH_UNREADABLE` ⇒ histórico incompleto);
 * - `assistant.tool_calls` → TOOL_CALL logo após o texto da mesma mensagem
 *   (a ordem texto × execução DENTRO da mensagem não é cronológica: exp. 5);
 * - mensagens `tool` (resultados) nunca viram fala; servem só para conferir o
 *   pareamento com a chamada.
 * Qualquer desvio do formato observado vira `issue` ⇒ ordem `UNKNOWN`
 * (nenhuma decisão dependente de ordem; revisão humana).
 */

export interface ObservedToolCall {
  /** Nome do PROVEDOR (antes do mapeamento), para conferir `function_calls`. */
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>> | null;
}

export interface ChatEntries {
  readonly entries: PostCallEntry[];
  readonly toolCalls: ObservedToolCall[];
}

type Speech = Extract<MillisChatMessage, { role: 'user' | 'assistant' }>;
type ToolResult = Extract<MillisChatMessage, { role: 'tool' }>;

interface Walk extends ChatEntries {
  readonly open: Map<string, string>;
  readonly seen: Set<string>;
  readonly issues: Set<string>;
  readonly toolNames: ReadonlyMap<string, string>;
}

function parseArguments(raw: string, issues: Set<string>): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // tratado abaixo
  }
  issues.add('TOOL_ARGUMENTS_INVALID');
  return null;
}

function pushText(walk: Walk, message: Speech): void {
  const kind = message.role === 'user' ? 'LEAD' : 'AGENT';
  if (message.content === null) {
    // Reauditoria A3: fala do interlocutor sem texto legível (ex.: campo `text`
    // no lugar de `content`) ou do agente sem texto nem ferramenta = possível perda.
    if (kind === 'LEAD' || message.toolCalls.length === 0) walk.issues.add('SPEECH_UNREADABLE');
    return;
  }
  if (!message.content) return;
  if (message.content.length <= POST_CALL_MAX_TEXT) {
    walk.entries.push({ kind, text: message.content });
    return;
  }
  // A fala fica marcada como truncada: nunca sustenta decisão definitiva.
  walk.issues.add('TEXT_TRUNCATED');
  walk.entries.push({ kind, text: message.content.slice(0, POST_CALL_MAX_TEXT), truncated: true });
}

function pushToolCalls(walk: Walk, message: Speech): void {
  for (const call of message.toolCalls) {
    if (walk.seen.has(call.id)) walk.issues.add('DUPLICATE_TOOL_CALL_ID');
    walk.seen.add(call.id);
    walk.open.set(call.id, call.name);
    const args = parseArguments(call.arguments, walk.issues);
    walk.toolCalls.push({ name: call.name, args });
    const toolName = walk.toolNames.get(call.name) ?? call.name;
    walk.entries.push({ kind: 'TOOL_CALL', toolName, arguments: args });
  }
}

function closeResult(walk: Walk, message: ToolResult): void {
  const name = message.toolCallId ? walk.open.get(message.toolCallId) : undefined;
  if (!name || (message.name !== null && message.name !== name)) {
    walk.issues.add('TOOL_RESULT_UNPAIRED');
    return;
  }
  walk.open.delete(message.toolCallId!);
}

export function chatEntries(
  report: MillisSessionReport,
  toolNames: ReadonlyMap<string, string>,
  issues: Set<string>,
): ChatEntries {
  const walk: Walk = {
    entries: [],
    toolCalls: [],
    open: new Map(),
    seen: new Set(),
    issues,
    toolNames,
  };
  for (const message of report.chat) {
    if (message.role === 'other') issues.add('UNRECOGNIZED_MESSAGE');
    else if (message.role === 'tool') closeResult(walk, message);
    else {
      pushText(walk, message);
      pushToolCalls(walk, message);
    }
  }
  if (walk.entries.length > POST_CALL_MAX_ENTRIES) {
    issues.add('ENTRIES_TRUNCATED');
    walk.entries.length = POST_CALL_MAX_ENTRIES;
  }
  return { entries: walk.entries, toolCalls: walk.toolCalls };
}
