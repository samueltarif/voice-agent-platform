import type {
  NormalizedSessionReportEvent,
  PostCallEndReason,
  ProviderWebhookNormalizer,
  ProviderWebhookRequest,
} from '@voice-agent/contracts';
import { checkFunctionCalls } from './millis-session-report-consistency.js';
import { chatEntries } from './millis-session-report-entries.js';
import {
  parseMillisSessionReport,
  type MillisSessionReport,
} from './millis-session-report-parse.js';

/**
 * E2-V / DEC-077 — adaptador Millis → `PostCallReport` (`PROVIDER-UNVERIFIED`,
 * baseado em UMA amostra anonimizada; ver `docs/architecture/E2V_RESEARCH_AND_VALIDATION.md`).
 *
 * - Referência da chamada = `session_id` do PROVEDOR. `metadata`, `call_id` e
 *   `agent_id` NÃO identificam a tentativa (metadata é ecoada do que enviamos;
 *   os outros vieram nulos). O tenant continua resolvido só no servidor.
 * - Integridade (A3): truncamento ou mensagem fora do formato ⇒ `INCOMPLETE`
 *   (uma fala pode ter sido perdida), separado da confiança na ordem.
 * - Ordem: o `chat` coincidiu, mensagem a mensagem, com a linha do tempo do
 *   exp. 5; `TIMELINE` só quando o formato e a conferência cruzada passam,
 *   senão `UNKNOWN` (revisão). Não há timestamps nem marca de interrupção.
 * - Fim: `call_status: "timeout"` ⇒ `TIMEOUT_UNSPECIFIED` (nunca inatividade
 *   ou desinteresse por inferência); `error_message` ⇒ `ERROR`; demais
 *   valores (não observados) ⇒ `UNKNOWN`.
 * - Autenticação NÃO é feita aqui (ver `millis-report-query-token-authenticator.ts`).
 */

export interface MillisSessionReportOptions {
  /** Nome publicado na Millis → nome da ferramenta no VAP (sem mapa: nome como veio). */
  readonly toolNames?: ReadonlyMap<string, string>;
}

export interface MillisSessionReportAdaptation {
  readonly event: NormalizedSessionReportEvent;
  /** Desvios que tornaram a ordem `UNKNOWN` (diagnóstico; sem dados pessoais). */
  readonly issues: readonly string[];
}

const MAX_DURATION_SECONDS = 86_400;
/** Desvios em que uma FALA pode ter sido perdida (A3): histórico incompleto, além de fora de ordem. */
const SPEECH_LOSS_ISSUES = new Set([
  'TEXT_TRUNCATED',
  'ENTRIES_TRUNCATED',
  'UNRECOGNIZED_MESSAGE',
  'TOOL_ARGUMENTS_INVALID',
]);
/** 2000-01-01 … 2100-01-01: fora disso a época não é plausível (usa o recebimento). */
const EPOCH_RANGE = [946_684_800, 4_102_444_800] as const;

function endReasonOf(report: MillisSessionReport): PostCallEndReason {
  if (report.errorMessage?.trim()) return 'ERROR';
  if (report.callStatus === 'timeout') return 'TIMEOUT_UNSPECIFIED';
  return 'UNKNOWN';
}

function durationOf(report: MillisSessionReport): number | null {
  const { duration } = report;
  return duration !== null && duration >= 0 && duration <= MAX_DURATION_SECONDS ? duration : null;
}

function occurredAtOf(report: MillisSessionReport, receivedAt: Date): string {
  const epoch = report.endedAtEpochSeconds;
  const plausible = epoch !== null && epoch >= EPOCH_RANGE[0] && epoch <= EPOCH_RANGE[1];
  return (plausible ? new Date(epoch * 1000) : receivedAt).toISOString();
}

export function adaptMillisSessionReport(
  request: ProviderWebhookRequest,
  options: MillisSessionReportOptions = {},
): MillisSessionReportAdaptation | null {
  const report = parseMillisSessionReport(request.rawBody);
  if (!report) return null;
  const issues = new Set<string>();
  const { entries, toolCalls } = chatEntries(report, options.toolNames ?? new Map(), issues);
  checkFunctionCalls(report, toolCalls, issues);
  const event: NormalizedSessionReportEvent = {
    kind: 'SESSION_REPORT',
    providerEventId: null,
    providerCallReference: report.sessionId,
    occurredAt: occurredAtOf(report, request.receivedAt),
    report: {
      ordering: issues.size === 0 ? 'TIMELINE' : 'UNKNOWN',
      integrity: [...issues].some((issue) => SPEECH_LOSS_ISSUES.has(issue))
        ? 'INCOMPLETE'
        : 'COMPLETE',
      entries,
      endReason: endReasonOf(report),
      durationSeconds: durationOf(report),
    },
  };
  return { event, issues: [...issues].sort() };
}

/** Normalizador SÓ do canal de relatório; a composição com outros canais é da fiação (E3). */
export function createMillisSessionReportNormalizer(
  options: MillisSessionReportOptions = {},
): ProviderWebhookNormalizer {
  return { normalize: (request) => adaptMillisSessionReport(request, options)?.event ?? null };
}
